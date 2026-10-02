import { test, expect } from "@playwright/test";
import { listDevices, getDevice, activeDeviceOfType, addDevice, updateDevice, retireDevice, deviceLabel, recordLibreSensorIfNew } from "../src/devices.js";

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test.describe("device register (pure logic)", () => {
  test("adding a device fills in id, status and dateAdded", () => {
    const s = fakeStorage();
    const d = addDevice({ type: "bluetooth-meter", serial: "AC-1234", nickname: "My meter" }, s);
    expect(d.id).toBeTruthy();
    expect(d.status).toBe("in use");
    expect(d.dateAdded).toBeTruthy();
    expect(getDevice(d.id, s)).toEqual(d);
  });

  test("rejects an unknown device type", () => {
    const s = fakeStorage();
    expect(() => addDevice({ type: "fitbit", serial: "x" }, s)).toThrow(/Unknown device type/);
  });

  test("listDevices is most-recently-added first", () => {
    const s = fakeStorage();
    addDevice({ type: "bluetooth-meter", serial: "A", dateAdded: "2026-01-01T00:00:00.000Z" }, s);
    addDevice({ type: "librelinkup", serial: "B", dateAdded: "2026-03-01T00:00:00.000Z" }, s);
    addDevice({ type: "other", serial: "C", dateAdded: "2026-02-01T00:00:00.000Z" }, s);
    expect(listDevices(s).map((d) => d.serial)).toEqual(["B", "C", "A"]);
  });

  test("activeDeviceOfType ignores finished/failed devices of that type", () => {
    const s = fakeStorage();
    const old = addDevice({ type: "bluetooth-meter", serial: "OLD" }, s);
    retireDevice(old.id, "failed", s);
    expect(activeDeviceOfType("bluetooth-meter", s)).toBeNull();
    const current = addDevice({ type: "bluetooth-meter", serial: "NEW" }, s);
    expect(activeDeviceOfType("bluetooth-meter", s).id).toBe(current.id);
  });

  test("updateDevice merges a patch; retireDevice is a status update, not a delete", () => {
    const s = fakeStorage();
    const d = addDevice({ type: "other", serial: "X", nickname: "old name" }, s);
    updateDevice(d.id, { nickname: "new name" }, s);
    expect(getDevice(d.id, s).nickname).toBe("new name");
    retireDevice(d.id, "finished", s);
    expect(getDevice(d.id, s).status).toBe("finished");
    expect(listDevices(s)).toHaveLength(1); // still there, just retired
  });

  test("deviceLabel maps a type id to its display name", () => {
    expect(deviceLabel("bluetooth-meter")).toBe("Accu-Chek Guide Me");
    expect(deviceLabel("dexcom-one-plus")).toBe("Dexcom ONE+");
    expect(deviceLabel("made-up")).toBe("made-up"); // falls back to the id itself rather than throwing
  });

  test("recordLibreSensorIfNew adds a sensor once, retiring the previous one as finished", () => {
    const s = fakeStorage();
    const first = recordLibreSensorIfNew({ serial: "SN-1", activatedAt: "2026-09-01T00:00:00.000Z" }, s);
    expect(first.type).toBe("librelinkup");
    expect(first.status).toBe("in use");

    // Same sensor synced again: no duplicate.
    expect(recordLibreSensorIfNew({ serial: "SN-1", activatedAt: "2026-09-01T00:00:00.000Z" }, s)).toBeNull();
    expect(listDevices(s)).toHaveLength(1);

    // A genuinely new sensor: added, and the old one is marked finished.
    const second = recordLibreSensorIfNew({ serial: "SN-2", activatedAt: "2026-09-05T00:00:00.000Z" }, s);
    expect(second.serial).toBe("SN-2");
    expect(getDevice(first.id, s).status).toBe("finished");
    expect(activeDeviceOfType("librelinkup", s).serial).toBe("SN-2");
  });

  test("recordLibreSensorIfNew does nothing without a serial", () => {
    const s = fakeStorage();
    expect(recordLibreSensorIfNew(null, s)).toBeNull();
    expect(recordLibreSensorIfNew({}, s)).toBeNull();
    expect(listDevices(s)).toHaveLength(0);
  });
});
