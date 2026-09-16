import { BrowserMultiFormatReader } from "@zxing/browser";

// Decodes from live camera video frames via canvas analysis (ZXing), not the
// native BarcodeDetector Shape Detection API — that API still isn't supported
// in Safari/iOS as of this writing, which would leave Scott's actual day-to-day
// device without a working scanner. This approach works the same way in every
// modern browser, camera access permitting.

let controls = null;

export function isCameraAvailable() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

// Starts scanning from the device camera into `videoElement`. Calls
// onDetected(text) once, then stops itself — this app wants one barcode per
// tap, not continuous scanning. onError covers camera-permission-denied and
// similar setup failures (never barcode-not-found-in-this-frame, which ZXing
// reports continuously and isn't a real error).
export async function startScanning(videoElement, { onDetected, onError }) {
  if (!isCameraAvailable()) {
    onError(new Error("Camera access isn't available in this browser."));
    return;
  }
  const reader = new BrowserMultiFormatReader();
  try {
    controls = await reader.decodeFromVideoDevice(undefined, videoElement, (result) => {
      if (result) {
        const text = result.getText();
        stopScanning();
        onDetected(text);
      }
    });
  } catch (err) {
    onError(err);
  }
}

export function stopScanning() {
  controls?.stop();
  controls = null;
}
