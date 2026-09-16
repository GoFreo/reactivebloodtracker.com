import { test, expect } from "@playwright/test";
import { parseGlucoseMeasurement } from "../src/bluetoothGlucose.js";

// Pure decoding logic, no device or browser needed — this is the part that
// can't be verified against Scott's real meter from here (see the module's own
// header comment), so it gets the strongest test coverage this repo can give it:
// a byte-for-byte constructed record per the official Bluetooth GATT spec.
test.describe("Bluetooth Glucose Measurement parsing", () => {
  test("decodes a kg/L-unit record (SFLOAT + Base Time) to the expected mmol/L value", () => {
    // Flags: bit1 (concentration present) = 1, bit2 (units) = 0 (kg/L), bit0 (time offset) = 0.
    const flags = 0b00000010;
    const seqNum = 1;
    // Base Time: 2026-09-14 10:30:00
    const year = 2026, month = 9, day = 14, hours = 10, minutes = 30, seconds = 0;
    // SFLOAT encoding of 0.000991 kg/L (== 99.1 mg/dL == 5.5 mmol/L): mantissa 991, exponent -6.
    const mantissa = 991;
    const exponent = -6;
    const sfloatRaw = ((exponent & 0x0f) << 12) | (mantissa & 0x0fff);

    const buffer = new ArrayBuffer(1 + 2 + 7 + 2);
    const view = new DataView(buffer);
    let offset = 0;
    view.setUint8(offset, flags); offset += 1;
    view.setUint16(offset, seqNum, true); offset += 2;
    view.setUint16(offset, year, true); offset += 2;
    view.setUint8(offset, month); offset += 1;
    view.setUint8(offset, day); offset += 1;
    view.setUint8(offset, hours); offset += 1;
    view.setUint8(offset, minutes); offset += 1;
    view.setUint8(offset, seconds); offset += 1;
    view.setUint16(offset, sfloatRaw, true); offset += 2;

    const result = parseGlucoseMeasurement(view);
    expect(result).not.toBeNull();
    expect(result.unit).toBe("mmol/L");
    expect(result.value).toBeCloseTo(5.5, 1);
    expect(result.timestamp).toBe(new Date(year, month - 1, day, hours, minutes, seconds).toISOString());
  });

  test("decodes a mol/L-unit record correctly (different unit bit, different math)", () => {
    const flags = 0b00000110; // concentration present + units=mol/L
    const buffer = new ArrayBuffer(1 + 2 + 7 + 2);
    const view = new DataView(buffer);
    let offset = 0;
    view.setUint8(offset, flags); offset += 1;
    view.setUint16(offset, 2, true); offset += 2;
    view.setUint16(offset, 2026, true); offset += 2;
    view.setUint8(offset, 9); offset += 1;
    view.setUint8(offset, 14); offset += 1;
    view.setUint8(offset, 11); offset += 1;
    view.setUint8(offset, 0); offset += 1;
    view.setUint8(offset, 0); offset += 1;
    // 0.0055 mol/L == 5.5 mmol/L: mantissa 55, exponent -4.
    const sfloatRaw = ((-4 & 0x0f) << 12) | (55 & 0x0fff);
    view.setUint16(offset, sfloatRaw, true);

    const result = parseGlucoseMeasurement(view);
    expect(result.value).toBeCloseTo(5.5, 1);
  });

  test("rejects an out-of-range decode instead of saving a garbage value", () => {
    const flags = 0b00000010; // kg/L
    const buffer = new ArrayBuffer(1 + 2 + 7 + 2);
    const view = new DataView(buffer);
    let offset = 0;
    view.setUint8(offset, flags); offset += 1;
    view.setUint16(offset, 3, true); offset += 2;
    view.setUint16(offset, 2026, true); offset += 2;
    view.setUint8(offset, 9); offset += 1;
    view.setUint8(offset, 14); offset += 1;
    view.setUint8(offset, 12); offset += 1;
    view.setUint8(offset, 0); offset += 1;
    view.setUint8(offset, 0); offset += 1;
    // A wildly large SFLOAT (mantissa 2000, exponent 2 -> 200000 kg/L) should
    // decode to a physiologically-impossible mmol/L and be rejected as null.
    const sfloatRaw = ((2 & 0x0f) << 12) | (2000 & 0x0fff);
    view.setUint16(offset, sfloatRaw, true);

    expect(parseGlucoseMeasurement(view)).toBeNull();
  });

  test("returns null when the record carries no glucose concentration at all", () => {
    const flags = 0b00000000; // concentration-present bit off
    const buffer = new ArrayBuffer(1 + 2 + 7);
    const view = new DataView(buffer);
    let offset = 0;
    view.setUint8(offset, flags); offset += 1;
    view.setUint16(offset, 4, true); offset += 2;
    view.setUint16(offset, 2026, true); offset += 2;
    view.setUint8(offset, 9); offset += 1;
    view.setUint8(offset, 14); offset += 1;
    view.setUint8(offset, 12); offset += 1;
    view.setUint8(offset, 1); offset += 1;
    view.setUint8(offset, 0);

    expect(parseGlucoseMeasurement(view)).toBeNull();
  });
});
