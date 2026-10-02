// Reads glucose readings directly from a BLE meter using the Bluetooth SIG's
// public, standard Glucose Service (UUID 0x1808) — not Roche's proprietary USB
// protocol, which they don't publish (see HANDOVER.md 2026-09-14). Confirmed
// against the official spec before writing any parsing code, not from memory:
// https://github.com/oesmith/gatt-xml/blob/master/org.bluetooth.characteristic.glucose_measurement.xml
// and the Bluetooth SIG's Glucose Service spec (GLS_v1.0.1).
//
// IMPORTANT: this is built strictly to the published spec but has NOT been run
// against Scott's actual Accu-Chek Guide Me — there's no way to verify that
// from here without the physical device. Treat the first real connection
// attempt as a test, not a known-working feature. Every parsed value is
// range-checked before being saved (see isPlausibleMmolL below) specifically
// so a spec-reading mistake can't silently save a wrong glucose number.

const GLUCOSE_SERVICE = "glucose";
const MEASUREMENT_CHAR = "glucose_measurement";
const RACP_CHAR = "record_access_control_point";
const MMOL_TO_MGDL = 18.0182;

// Device Information Service (Bluetooth SIG 0x180A) / Serial Number String
// (0x2A25) — a standard, widely-implemented service (unlike the Guide Me's
// own protocol, this one is generic BLE, not device-specific guesswork).
// Optional per spec: plenty of devices skip it, so every call site here
// treats its absence as "unknown serial," never an error.
const DEVICE_INFO_SERVICE = "device_information";
const SERIAL_CHAR = "serial_number_string";

// Byte 3 of a Record Access Control Point "Response Code" notification (spec
// GLS_v1.0.1) — what the meter actually said, not just "it responded." Without
// this, a meter reply of e.g. "no records" or "not supported" looked identical
// to genuine success with zero readings — a real silent-failure trap Scott hit
// 2026-09-15 (connects fine, nothing ever transfers, no visible reason why).
const RACP_RESPONSE_PROBLEMS = {
  2: "the meter says this type of request isn't supported",
  3: "the meter didn't recognise the request",
  4: "the meter says that operator isn't supported",
  5: "the meter says the request was invalid",
  6: "the meter has no stored records to send",
  7: "the meter couldn't complete the operation",
  8: "the meter says the procedure didn't finish",
  9: "the meter says that operand isn't supported",
};

export function isBluetoothAvailable() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

// 16-bit IEEE-11073 SFLOAT: 4-bit signed exponent (top nibble), 12-bit signed
// mantissa, both two's-complement. value = mantissa * 10^exponent.
function decodeSFLOAT(raw) {
  let mantissa = raw & 0x0fff;
  let exponent = (raw >> 12) & 0x0f;
  if (mantissa >= 0x0800) mantissa -= 0x1000;
  if (exponent >= 0x08) exponent -= 0x10;
  return mantissa * Math.pow(10, exponent);
}

function parseBaseTime(view, offset) {
  const year = view.getUint16(offset, true);
  const month = view.getUint8(offset + 2);
  const day = view.getUint8(offset + 3);
  const hours = view.getUint8(offset + 4);
  const minutes = view.getUint8(offset + 5);
  const seconds = view.getUint8(offset + 6);
  return { date: new Date(year, Math.max(0, month - 1), day, hours, minutes, seconds), size: 7 };
}

// A finger-prick glucose reading outside this range is essentially always a
// parsing bug, not a real value — reject rather than save something a spec
// misread could have fabricated. (~1-40 mmol/L covers every clinically
// reported human reading with wide margin.)
function isPlausibleMmolL(value) {
  return Number.isFinite(value) && value > 1 && value < 40;
}

// Parses one Glucose Measurement characteristic notification (DataView) into
// { value, unit: "mmol/L", timestamp } or null if it carries no concentration
// (the spec allows a record with only a sequence number/time, no reading).
export function parseGlucoseMeasurement(dataView) {
  const flags = dataView.getUint8(0);
  let offset = 1;
  offset += 2; // Sequence Number (uint16) — not needed, just skip past it

  const { date: baseTime, size: baseTimeSize } = parseBaseTime(dataView, offset);
  offset += baseTimeSize;

  const timeOffsetPresent = (flags & 0x01) !== 0;
  let timestamp = baseTime;
  if (timeOffsetPresent) {
    const timeOffsetMin = dataView.getInt16(offset, true);
    timestamp = new Date(baseTime.getTime() + timeOffsetMin * 60000);
    offset += 2;
  }

  const concentrationPresent = (flags & 0x02) !== 0;
  if (!concentrationPresent) return null;

  const raw = dataView.getUint16(offset, true);
  const concentration = decodeSFLOAT(raw);
  const isMolPerL = (flags & 0x04) !== 0;
  // kg/L -> mg/dL is *100000 per the spec's base units; mol/L -> mmol/L is *1000.
  const mmolL = isMolPerL ? concentration * 1000 : (concentration * 100000) / MMOL_TO_MGDL;

  if (!isPlausibleMmolL(mmolL)) return null;
  return { value: Math.round(mmolL * 10) / 10, unit: "mmol/L", timestamp: timestamp.toISOString() };
}

// Chrome (desktop + Android) remembers devices the picker already granted
// this origin, and getDevices() returns them with no prompt — Safari/iPhone
// doesn't have Web Bluetooth at all (see isBluetoothAvailable), so this is a
// Chrome-only convenience, feature-detected and never required for the flow
// to work. Only used when it resolves to exactly one device: with none,
// there's nothing to reconnect to; with more than one, we don't know which
// meter Scott means, so the ordinary picker (which does) is the safer choice
// rather than silently guessing.
export async function getRememberedDevice() {
  if (!navigator.bluetooth?.getDevices) return null;
  try {
    const devices = await navigator.bluetooth.getDevices();
    return devices.length === 1 ? devices[0] : null;
  } catch {
    // Some Chrome builds throw here if the permission policy disallows it —
    // fall back to the ordinary picker rather than fail the whole sync.
    return null;
  }
}

// Reads the Device Information Service's serial, if the device exposes it and
// this connection was granted access to it. Never throws: a device that
// doesn't implement this (optional per spec) is common, and so is a device
// paired *before* device_information was added to optionalServices below — a
// silent reconnect (getRememberedDevice) replays the original grant, which
// for an already-paired meter won't include it until the next full re-pair
// through the picker. Either way, "serial unknown" is the correct, honest
// result — never block the actual readings sync over this.
async function readDeviceSerial(server) {
  try {
    const service = await server.getPrimaryService(DEVICE_INFO_SERVICE);
    const char = await service.getCharacteristic(SERIAL_CHAR);
    const value = await char.readValue();
    const text = new TextDecoder().decode(value).trim();
    return text || null;
  } catch {
    return null;
  }
}

// Opens the browser's own Bluetooth device picker (or silently reconnects to
// a remembered device, see getRememberedDevice above), connects, and requests
// every stored record via the Record Access Control Point (op 1 "report
// stored records", operator 1 "all records") — Scott asked for the device's
// existing history, not just whatever it reads next. Returns
// { readings, serial, deviceName } — serial is null when the device doesn't
// expose it (see readDeviceSerial); caller decides how to save/de-duplicate
// readings and whether to check serial against a registered device.
export async function connectAndFetchReadings({ onStatus = () => {} } = {}) {
  if (!isBluetoothAvailable()) {
    throw new Error("Web Bluetooth isn't available in this browser — this only works in Chrome (Mac or Android), not Safari/iPhone.");
  }

  let device = await getRememberedDevice();
  if (device) {
    onStatus(`Reconnecting to ${device.name || "your meter"}…`);
  } else {
    onStatus("Choose your meter in the browser's device picker…");
    // acceptAllDevices, not a service filter: Chrome's picker can only filter by
    // services a device actively broadcasts in its advertisement packet, and
    // plenty of BLE health devices (this meter included, going by Scott's
    // "nothing shows up" report 2026-09-14) don't advertise the Glucose Service
    // openly even though they support it once connected — a filter would hide
    // the device entirely rather than fail loudly. optionalServices is what
    // actually grants access to the service after connecting.
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [GLUCOSE_SERVICE, DEVICE_INFO_SERVICE],
    });
  }

  onStatus(`Connecting to ${device.name || "meter"}…`);
  const server = await device.gatt.connect();
  const serial = await readDeviceSerial(server);
  const service = await server.getPrimaryService(GLUCOSE_SERVICE);
  const measurementChar = await service.getCharacteristic(MEASUREMENT_CHAR);
  const racpChar = await service.getCharacteristic(RACP_CHAR);

  const readings = [];
  const measurementListener = (event) => {
    const parsed = parseGlucoseMeasurement(event.target.value);
    if (parsed) readings.push(parsed);
  };

  await measurementChar.startNotifications();
  measurementChar.addEventListener("characteristicvaluechanged", measurementListener);

  onStatus("Requesting stored readings…");
  const done = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Meter didn't respond in time — try again with it closer to the device.")), 15000);
    racpChar.addEventListener("characteristicvaluechanged", function onRacp(event) {
      const opCode = event.target.value.getUint8(0);
      if (opCode === 6) {
        // Response Code notification = the meter has finished responding —
        // but "responded" isn't "succeeded". Byte 3 is the actual outcome.
        clearTimeout(timeout);
        racpChar.removeEventListener("characteristicvaluechanged", onRacp);
        const responseValue = event.target.value.getUint8(3);
        const problem = RACP_RESPONSE_PROBLEMS[responseValue];
        if (problem) {
          reject(new Error(`Meter responded but sent no records: ${problem}.`));
        } else {
          resolve();
        }
      }
    });
  });
  await racpChar.startNotifications();
  await racpChar.writeValue(new Uint8Array([0x01, 0x01]));

  try {
    await done;
  } finally {
    measurementChar.removeEventListener("characteristicvaluechanged", measurementListener);
    device.gatt.disconnect();
  }

  return { readings, serial, deviceName: device.name || null };
}
