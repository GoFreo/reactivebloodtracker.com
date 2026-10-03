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

// getRememberedDevice() — Chrome-only silent-reconnect lookup, added 2026-10-01.
// This is pure logic over navigator.bluetooth.getDevices(), so unlike the GATT
// connect/RACP flow in connectAndFetchReadings (which needs a real paired meter
// and can't be exercised from an automated test), it can be verified here with
// a stubbed navigator — no real Bluetooth hardware or browser involved.
//
// Node (v20+) defines a built-in global `navigator` as a getter-only property,
// so a plain `globalThis.navigator = {...}` throws ("has only a getter") under
// this project's Node version — Object.defineProperty can still redefine it
// since the built-in descriptor is configurable. Restored after each test so a
// stubbed navigator can't leak into another test file sharing this worker.
const realNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
function stubNavigator(value) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}
test.describe("getRememberedDevice (Chrome reconnect-without-picker)", () => {
  test.afterEach(() => {
    Object.defineProperty(globalThis, "navigator", realNavigatorDescriptor);
  });

  test("returns null when the browser has no Web Bluetooth support at all", async () => {
    const { getRememberedDevice } = await import("../src/bluetoothGlucose.js");
    stubNavigator({});
    expect(await getRememberedDevice()).toBeNull();
  });

  test("returns null when getDevices() is unsupported (no bluetooth.getDevices)", async () => {
    const { getRememberedDevice } = await import("../src/bluetoothGlucose.js");
    stubNavigator({ bluetooth: {} });
    expect(await getRememberedDevice()).toBeNull();
  });

  test("returns the device when exactly one is remembered", async () => {
    const { getRememberedDevice } = await import("../src/bluetoothGlucose.js");
    const fakeDevice = { name: "Accu-Chek Guide Me" };
    stubNavigator({ bluetooth: { getDevices: async () => [fakeDevice] } });
    expect(await getRememberedDevice()).toBe(fakeDevice);
  });

  test("returns null when zero devices are remembered (nothing to reconnect to)", async () => {
    const { getRememberedDevice } = await import("../src/bluetoothGlucose.js");
    stubNavigator({ bluetooth: { getDevices: async () => [] } });
    expect(await getRememberedDevice()).toBeNull();
  });

  test("returns null when more than one device is remembered (ambiguous — use the picker)", async () => {
    const { getRememberedDevice } = await import("../src/bluetoothGlucose.js");
    stubNavigator({ bluetooth: { getDevices: async () => [{ name: "A" }, { name: "B" }] } });
    expect(await getRememberedDevice()).toBeNull();
  });

  test("returns null rather than throwing when getDevices() rejects (permission-policy case)", async () => {
    const { getRememberedDevice } = await import("../src/bluetoothGlucose.js");
    stubNavigator({ bluetooth: { getDevices: async () => { throw new Error("disallowed"); } } });
    expect(await getRememberedDevice()).toBeNull();
  });
});

// Scott, 2026-10-03: the picker listed every TV and phone nearby, and the meter
// had to be picked again every sync. The picker is now filtered to meters, and
// the meter that synced last is preferred when Chrome hands back remembered devices.
test.describe("meter picker filtering and remembering the meter", () => {
  test.afterEach(() => {
    Object.defineProperty(globalThis, "navigator", realNavigatorDescriptor);
    delete globalThis.localStorage;
  });

  test("the picker lists only glucose meters: by Glucose Service or a meter name", async () => {
    const { meterPickerOptions, isMeterName } = await import("../src/bluetoothGlucose.js");
    const opts = meterPickerOptions();
    expect(opts.acceptAllDevices).toBeUndefined();
    expect(opts.filters).toEqual([{ services: ["glucose"] }, { namePrefix: "meter+" }]);
    expect(opts.optionalServices).toEqual(["glucose", "device_information"]);
    expect(isMeterName("meter+40956850")).toBe(true);
    expect(isMeterName("Living Room TV")).toBe(false);
    expect(isMeterName(undefined)).toBe(false);
  });

  test("prefers the meter that synced last time, by its saved id", async () => {
    const { getRememberedDevice } = await import("../src/bluetoothGlucose.js");
    const store = { "rht-bluetooth-device-id": "id-2" };
    globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
    const devices = [{ id: "id-1", name: "meter+1111" }, { id: "id-2", name: "meter+2222" }, { id: "id-3", name: "TV" }];
    stubNavigator({ bluetooth: { getDevices: async () => devices } });
    expect(await getRememberedDevice()).toBe(devices[1]);
  });

  test("with no saved id, picks the only remembered device that is a meter", async () => {
    const { getRememberedDevice } = await import("../src/bluetoothGlucose.js");
    const devices = [{ id: "a", name: "Phone" }, { id: "b", name: "meter+40956850" }, { id: "c", name: "TV" }];
    stubNavigator({ bluetooth: { getDevices: async () => devices } });
    expect(await getRememberedDevice()).toBe(devices[1]);
  });

  test("two remembered meters and no saved id is ambiguous: use the picker", async () => {
    const { getRememberedDevice } = await import("../src/bluetoothGlucose.js");
    stubNavigator({ bluetooth: { getDevices: async () => [{ id: "a", name: "meter+1" }, { id: "b", name: "meter+2" }] } });
    expect(await getRememberedDevice()).toBeNull();
  });
});
