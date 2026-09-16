import { test, expect } from "@playwright/test";
import { parseExifDateTimeOriginal } from "../src/photoImport.js";

// Hand-builds the minimal valid JPEG/EXIF byte structure needed to carry one
// DateTimeOriginal tag, byte-for-byte per the TIFF/EXIF spec (CIPA DC-008) —
// same approach as tests/bluetoothGlucose.spec.js's hand-built DataViews,
// since there's no physical camera here to produce a real file from.
function buildJpegWithExifDate(dateString) {
  const buf = new ArrayBuffer(78);
  const v = new DataView(buf);

  v.setUint16(0, 0xffd8); // SOI
  v.setUint16(2, 0xffe1); // APP1
  v.setUint16(4, 0x0048); // segment length (72): from the length field itself through the string's NUL
  v.setUint32(6, 0x45786966); // "Exif"
  v.setUint16(10, 0x0000); // "\0\0"

  const tiffStart = 12;
  v.setUint16(tiffStart, 0x4949, true); // "II" little-endian
  v.setUint16(tiffStart + 2, 0x002a, true);
  v.setUint32(tiffStart + 4, 8, true); // IFD0 at tiffStart+8

  // IFD0: one entry, pointing to the Exif SubIFD
  v.setUint16(tiffStart + 8, 1, true); // entry count
  v.setUint16(tiffStart + 10, 0x8769, true); // tag: Exif IFD pointer
  v.setUint16(tiffStart + 12, 4, true); // type: LONG
  v.setUint32(tiffStart + 14, 1, true); // count
  v.setUint32(tiffStart + 18, 26, true); // value: Exif SubIFD offset (relative to tiffStart) = 26
  v.setUint32(tiffStart + 22, 0, true); // next IFD offset: none

  // Exif SubIFD (at tiffStart+26 = absolute 38): one entry, DateTimeOriginal
  v.setUint16(tiffStart + 26, 1, true); // entry count
  v.setUint16(tiffStart + 28, 0x9003, true); // tag: DateTimeOriginal
  v.setUint16(tiffStart + 30, 2, true); // type: ASCII
  v.setUint32(tiffStart + 32, 20, true); // count: 19 chars + NUL
  v.setUint32(tiffStart + 36, 44, true); // value: string offset (relative to tiffStart) = 44
  v.setUint32(tiffStart + 40, 0, true); // next IFD offset: none

  // The date string itself, at tiffStart+44 = absolute 56
  const bytes = new TextEncoder().encode(`${dateString}\0`);
  for (let i = 0; i < bytes.length; i++) v.setUint8(56 + i, bytes[i]);

  v.setUint16(76, 0xffda); // SOS — safely terminates the marker scan

  return v;
}

test.describe("EXIF DateTimeOriginal parsing", () => {
  test("reads the capture date out of a well-formed JPEG/EXIF structure", () => {
    const view = buildJpegWithExifDate("2026:09:15 18:30:00");
    const date = parseExifDateTimeOriginal(view);
    expect(date).not.toBeNull();
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8); // 0-indexed: September
    expect(date.getDate()).toBe(15);
    expect(date.getHours()).toBe(18);
    expect(date.getMinutes()).toBe(30);
  });

  test("returns null for a file that isn't a JPEG at all", () => {
    const view = new DataView(new ArrayBuffer(16));
    view.setUint16(0, 0x8950); // PNG-ish, not FFD8
    expect(parseExifDateTimeOriginal(view)).toBeNull();
  });

  test("returns null for a JPEG with no APP1/EXIF segment", () => {
    const buf = new ArrayBuffer(10);
    const v = new DataView(buf);
    v.setUint16(0, 0xffd8); // SOI
    v.setUint16(2, 0xffda); // straight to Start of Scan — no metadata at all
    expect(parseExifDateTimeOriginal(v)).toBeNull();
  });
});
