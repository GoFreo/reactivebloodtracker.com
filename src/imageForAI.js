// Shrinks food photos, for two uses:
//  - downscaleForAI: the copy sent to the AI proxy (reasons below).
//  - shrinkForStorage: the copy saved with the meal (added 2026-09-28, Scott's OK). Full-size
//    iPhone photos are 2–5 MB each, ~5 GB a year at three a day in the browser's storage, which
//    iPhones may clear when space is short. The original stays in the phone's camera roll.
//    Photos saved before this change are left as they are.
//
// Why this exists: parseFoodWithAI used to base64 the raw camera file. Two facts make that
// wasteful and, for big photos, fatal:
//  - Netlify Functions take at most a 6 MB buffered request body (Netlify docs, "Configuration
//    for functions"), and base64 adds ~33%, so a photo over ~4.5 MB raw never reaches ai-proxy at
//    all. Scott's own staged photos measured 1.97 / 3.19 / 4.68 MB on 2026-09-20 — the biggest
//    is over that line.
//  - The model ai-proxy uses (Claude Haiku 4.5, the "standard" resolution tier) downscales
//    anything past 1568 px on the long edge on Anthropic's side anyway (Anthropic vision docs),
//    so full-resolution uploads buy no accuracy, only upload time on mobile data.
//
// If ai-proxy's MODEL is ever switched to a Claude 4.7+ model (the "high-resolution" tier,
// 2576 px long edge), raise AI_MAX_EDGE to match or this will cap detail below what it could use.

export const AI_MAX_EDGE = 1568;
export const AI_JPEG_QUALITY = 0.85;

// Pure size math, kept separate so it's unit-testable without a browser.
export function scaledSize(width, height, maxEdge = AI_MAX_EDGE) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export const STORE_MAX_EDGE = 1600;
export const STORE_JPEG_QUALITY = 0.8;

export const downscaleForAI = (blob) => downscaleImage(blob, AI_MAX_EDGE, AI_JPEG_QUALITY);
export const shrinkForStorage = (blob) => downscaleImage(blob, STORE_MAX_EDGE, STORE_JPEG_QUALITY);

// Returns a JPEG Blob at most maxEdge on its longest side. On ANY failure (a format
// the browser can't decode, canvas unavailable, ...) it returns the original blob, so this
// can only ever make a photo smaller — never break one that works today. Browsers apply
// the photo's EXIF rotation when drawing it, so the result is upright.
export async function downscaleImage(blob, maxEdge, quality) {
  let url;
  try {
    url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();

    const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight, maxEdge);
    const alreadySmall = width === img.naturalWidth && height === img.naturalHeight;
    if (alreadySmall && blob.type === "image/jpeg") return blob;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    // JPEG has no transparency — paint white first so a transparent PNG doesn't go black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return out && out.size < blob.size ? out : blob;
  } catch {
    return blob;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
