// Lets Scott hand the app a batch of food photos taken on his phone — moved
// to the Mac by AirDrop or iCloud Photos, since a website has no way to reach
// into a phone's camera roll itself — and have each one become its own food
// diary entry, dated by the moment the photo was actually taken rather than
// whenever they happen to get imported or in whatever order they were picked.
//
// Reads each JPEG's own embedded EXIF "DateTimeOriginal" field directly
// (spec: CIPA DC-008 / the TIFF structure inside a JPEG's APP1 segment).
// Hand-rolled rather than a library: this needs exactly one ASCII field out
// of that structure, not general-purpose EXIF support — pulling in a whole
// library for one field would be exactly the kind of dependency this project
// avoids when a narrow, well-spec'd read does the job (see HANDOVER.md on
// the SparkyFitness licensing caution — same "don't borrow more than you
// need" reasoning applies to dependencies as much as to code).

function readIfd(view, tiffStart, ifdOffset, little) {
  const entryCount = view.getUint16(tiffStart + ifdOffset, little);
  const entries = new Map();
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = tiffStart + ifdOffset + 2 + i * 12;
    entries.set(view.getUint16(entryOffset, little), {
      count: view.getUint32(entryOffset + 4, little),
      valueOffset: entryOffset + 8,
    });
  }
  return entries;
}

// ASCII values of 4 bytes or fewer sit inline in the entry's own value field;
// longer ones (like a 20-byte date string) are stored elsewhere, at an offset
// (relative to the TIFF header) written into those same 4 bytes instead.
function readAsciiValue(view, tiffStart, entry, little) {
  const byteLength = entry.count;
  const dataStart = byteLength <= 4 ? entry.valueOffset : tiffStart + view.getUint32(entry.valueOffset, little);
  let str = "";
  for (let i = 0; i < byteLength - 1; i++) str += String.fromCharCode(view.getUint8(dataStart + i)); // drop trailing NUL
  return str;
}

// Exported for testing against hand-built byte arrays; real callers use
// readPhotoTimestamp below, which always has a safe fallback.
export function parseExifDateTimeOriginal(view) {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // not a JPEG

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) break; // not a marker — corrupt or unexpected, stop rather than misread
    if (marker === 0xffda) break; // Start of Scan — image data follows, no more metadata markers
    const segmentLength = view.getUint16(offset + 2);

    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      const tiffStart = offset + 10; // past the marker, length, and "Exif\0\0"
      const little = view.getUint16(tiffStart) === 0x4949;
      const ifd0Offset = view.getUint32(tiffStart + 4, little);
      const exifPointer = readIfd(view, tiffStart, ifd0Offset, little).get(0x8769); // Exif SubIFD pointer
      if (!exifPointer) return null;

      const exifIfd = readIfd(view, tiffStart, view.getUint32(exifPointer.valueOffset, little), little);
      const dateEntry = exifIfd.get(0x9003) || exifIfd.get(0x9004); // DateTimeOriginal, else DateTimeDigitized
      if (!dateEntry) return null;

      const str = readAsciiValue(view, tiffStart, dateEntry, little);
      const m = str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (!m) return null;
      const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
      return new Date(y, mo - 1, d, h, mi, s);
    }
    offset += 2 + segmentLength;
  }
  return null;
}

// Never throws — a photo with missing or unreadable EXIF (a screenshot, a
// re-saved image, an unusual camera app) still imports, just dated by the
// file's own last-modified time instead of its capture moment.
export async function readPhotoTimestamp(file) {
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer(); // EXIF always sits near the start
    const exifDate = parseExifDateTimeOriginal(new DataView(buf));
    if (exifDate) return exifDate;
  } catch {
    // fall through to the file's own timestamp below
  }
  return new Date(file.lastModified);
}

// Oldest-first, so importing "the whole day" logs meals in the order they
// actually happened rather than whatever order they were selected in.
export async function readPhotoTimestamps(files) {
  const withTimes = await Promise.all(
    [...files].map(async (file) => ({ file, timestamp: await readPhotoTimestamp(file) }))
  );
  return withTimes.sort((a, b) => a.timestamp - b.timestamp);
}

// WebKit's IndexedDB can throw "Error preparing Blob/File data to be stored
// in object store" for certain File objects — confirmed 2026-09-15 against
// this exact import flow (see HANDOVER.md). Rebuilding a plain Blob from the
// file's own bytes, rather than storing the File object itself, sidesteps it;
// functionally identical everywhere the rest of the app reads a photoBlob
// (object-URL preview, sending to the AI proxy), so nothing else changes.
export async function toStorableBlob(file) {
  const buf = await file.arrayBuffer();
  return new Blob([buf], { type: file.type || "image/jpeg" });
}
