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

// Opens the browser's own Bluetooth device picker, connects, and requests
// every stored record via the Record Access Control Point (op 1 "report
// stored records", operator 1 "all records") — Scott asked for the device's
// existing history, not just whatever it reads next. Returns the parsed,
// range-checked readings; caller decides how to save/de-duplicate them.
export async function connectAndFetchReadings({ onStatus = () => {} } = {}) {
  if (!isBluetoothAvailable()) {
    throw new Error("Web Bluetooth isn't available in this browser — this only works in Chrome (Mac or Android), not Safari/iPhone.");
  }

  onStatus("Choose your meter in the browser's device picker…");
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [GLUCOSE_SERVICE] }],
  });

  onStatus(`Connecting to ${device.name || "meter"}…`);
  const server = await device.gatt.connect();
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
        // Response Code notification = the meter has finished sending records.
        clearTimeout(timeout);
        racpChar.removeEventListener("characteristicvaluechanged", onRacp);
        resolve();
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

  return readings;
}
