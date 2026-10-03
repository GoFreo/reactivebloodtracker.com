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

// Names glucose meters advertise. Roche's Accu-Chek Guide / Guide Me / Instant
// show up as "meter+<serial>" (Scott's own Guide Me: "meter+40956850", seen in
// the picker 2026-10-03). Add a prefix here when a new meter model is supported.
export const METER_NAME_PREFIXES = ["meter+"];
const LAST_DEVICE_KEY = "rht-bluetooth-device-id";

export const isMeterName = (name) => METER_NAME_PREFIXES.some((p) => String(name || "").startsWith(p));

// What Chrome's device picker is allowed to list (Scott, 2026-10-03: it showed
// every TV, phone and "Unknown or Unsupported Device" nearby). Filters are OR'd:
// a device appears if it advertises the standard Glucose Service *or* has a known
// meter name — the name filter matters because many meters (the Guide Me
// included, going by the 2026-09-14 "nothing shows up" report) don't put the
// Glucose Service in their advertisement, which is why this used to be
// acceptAllDevices. optionalServices is what grants access once connected.
export function meterPickerOptions() {
  return {
    filters: [{ services: [GLUCOSE_SERVICE] }, ...METER_NAME_PREFIXES.map((namePrefix) => ({ namePrefix }))],
    optionalServices: [GLUCOSE_SERVICE, DEVICE_INFO_SERVICE],
  };
}

function savedDeviceId() {
  try {
    return globalThis.localStorage?.getItem(LAST_DEVICE_KEY) || null;
  } catch {
    return null;
  }
}

function saveDeviceId(id) {
  try {
    if (id) globalThis.localStorage?.setItem(LAST_DEVICE_KEY, id);
  } catch {
    // Not fatal: the picker just shows next time.
  }
}

// Chrome can hand back devices this site was granted before, with no picker —
// but only where its getDevices() is switched on (in Chrome it has been behind a
// setting, chrome://flags "Web Bluetooth new permissions backend"; Safari/iPhone
// has no Web Bluetooth at all). Feature-detected, never required. Choice order:
// the meter that synced last time (saved id) → the only remembered device with a
// meter name → the only remembered device at all. Anything more ambiguous uses
// the picker, which (filtered, above) now lists only meters anyway.
export async function getRememberedDevice() {
  if (!navigator.bluetooth?.getDevices) return null;
  try {
    const devices = await navigator.bluetooth.getDevices();
    const saved = savedDeviceId();
    const byId = saved && devices.find((d) => d.id === saved);
    if (byId) return byId;
    const meters = devices.filter((d) => isMeterName(d.name));
    if (meters.length === 1) return meters[0];
    return devices.length === 1 ? devices[0] : null;
  } catch {
    // Some Chrome builds throw here if the permission policy disallows it —
    // fall back to the ordinary picker rather than fail the whole sync.
    return null;
  }
}

// A remembered device usually has to be *seen* advertising before Chrome will
// connect to it, so listen for its next advertisement first where the browser
// supports that, then connect.
async function reconnect(device) {
  if (typeof device.watchAdvertisements === "function") {
    const seen = new Promise((resolve) => device.addEventListener("advertisementreceived", resolve, { once: true }));
    try {
      await device.watchAdvertisements();
      await seen;
    } catch {
      // Not supported here; just try connecting.
    } finally {
      try { device.unwatchAdvertisements?.(); } catch {}
    }
  }
  return device.gatt.connect();
}

// A remembered meter that's switched off or out of range can leave connect()
// hanging, so give up after a few seconds and use the picker instead.
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms))),
  ]);
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
export async function connectAndFetchReadings({ onStatus = () => {}, confirmPicker = async () => true } = {}) {
  if (!isBluetoothAvailable()) {
    throw new Error("Web Bluetooth isn't available in this browser — this only works in Chrome (Mac or Android), not Safari/iPhone.");
  }

  let device = await getRememberedDevice();
  let server = null;
  if (device) {
    onStatus(`Reconnecting to ${device.name || "your meter"}…`);
    try {
      server = await withTimeout(reconnect(device), 8000, "reconnect timed out");
    } catch {
      device = null; // fall through to the picker
    }
    // Chrome only opens its device picker straight after a tap (Scott's syncs
    // failed 2026-10-03 because the reconnect attempt above used up that window),
    // so a failed reconnect asks for one more tap before showing the picker.
    if (!server && !(await confirmPicker())) throw new Error("skipped.");
  }
  if (!server) {
    onStatus("Choose your meter in the browser's device picker…");
    try {
      device = await navigator.bluetooth.requestDevice(meterPickerOptions());
    } catch (err) {
      // Chrome reports both "cancelled" and "nothing to pick" as NotFoundError.
      if (err?.name === "NotFoundError") {
        // Chrome's own wording kept in brackets: "cancelled" and "nothing matched"
        // need different fixes, and only the browser knows which it was.
        throw new Error(`no meter chosen (Chrome said: "${err.message}"). If yours wasn't listed, switch it on until it shows the Bluetooth symbol, then sync again.`);
      }
      throw err;
    }
    onStatus(`Connecting to ${device.name || "meter"}…`);
    server = await device.gatt.connect();
  }
  saveDeviceId(device.id);
  // Which step was running when something failed — added to the error so a
  // "Meter: failed" on Scott's screen says *where* (2026-10-03: intermittent
  // timeouts with the real Guide Me, cause not yet known).
  let step = "reading the meter's serial number";
  const readings = [];
  let serial = null;
  try {
    serial = await readDeviceSerial(server);
    step = "opening the meter's glucose records";
    const service = await server.getPrimaryService(GLUCOSE_SERVICE);
    const measurementChar = await service.getCharacteristic(MEASUREMENT_CHAR);
    const racpChar = await service.getCharacteristic(RACP_CHAR);

    // Gives up only after this long with *nothing* arriving: a meter with a long
    // history keeps sending records, and a fixed total time could cut it off mid-way.
    const QUIET_MS = 15000;
    let timeout;
    let fail;
    const restartTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fail(new Error("the meter stopped responding")), QUIET_MS);
    };
    const done = new Promise((resolve, reject) => {
      fail = reject;
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
            reject(new Error(`the meter answered but sent no records: ${problem}`));
          } else {
            resolve();
          }
        }
      });
    });
    const measurementListener = (event) => {
      restartTimer();
      const parsed = parseGlucoseMeasurement(event.target.value);
      if (parsed) readings.push(parsed);
    };

    step = "turning on reading notifications";
    await measurementChar.startNotifications();
    measurementChar.addEventListener("characteristicvaluechanged", measurementListener);
    await racpChar.startNotifications();

    step = "asking for stored readings";
    onStatus("Requesting stored readings…");
    restartTimer();
    await racpChar.writeValue(new Uint8Array([0x01, 0x01]));
    step = `receiving stored readings (${readings.length} so far)`;
    try {
      await done;
    } finally {
      clearTimeout(timeout);
      measurementChar.removeEventListener("characteristicvaluechanged", measurementListener);
    }
  } catch (err) {
    if (step.startsWith("receiving")) step = `receiving stored readings (${readings.length} received)`;
    throw new Error(`${err.message || err} — while ${step}. Turn the meter off and on, keep it close, and sync again.`);
  } finally {
    try {
      device.gatt.disconnect();
    } catch {}
  }

  return { readings, serial, deviceName: device.name || null };
}
