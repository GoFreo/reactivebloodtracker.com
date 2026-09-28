import { addEntry, getAllEntries } from "./db.js";
import { downscaleForAI } from "./imageForAI.js";

export async function saveFoodEntry({ text, photoBlob, timestamp, aiResult, items, carbsTotal }) {
  const entry = {
    type: "food",
    text: text || "",
    photoBlob: photoBlob || null,
    timestamp,
    aiResult: aiResult || null,
  };
  // Only meals built from ingredients carry these (see mealBuilder.js).
  if (items?.length) {
    entry.items = items;
    entry.carbsTotal = carbsTotal ?? null;
  }
  return addEntry("food", entry);
}

export async function listFoodEntries() {
  return getAllEntries("food");
}

// Calls the Netlify function that proxies the Anthropic API. Returns
// { configured: false, error } until Scott's dedicated API key is wired in,
// or when running against a plain `vite` dev server with no functions runtime —
// both are expected, current states, not bugs.
export async function parseFoodWithAI({ text, photoBlob }) {
  const body = {};
  if (text) body.text = text;
  if (photoBlob) {
    // Shrink only the copy sent for parsing; the saved photo is untouched (see imageForAI.js).
    const sendBlob = await downscaleForAI(photoBlob);
    body.imageBase64 = await blobToBase64(sendBlob);
    body.mimeType = sendBlob.type || "image/jpeg";
  }

  let res;
  try {
    const headers = { "Content-Type": "application/json" };
    // Only present if VITE_APP_SHARED_SECRET was set at build time — see ai-proxy.js.
    const sharedSecret = import.meta.env.VITE_APP_SHARED_SECRET;
    if (sharedSecret) headers["x-app-secret"] = sharedSecret;

    res = await fetch("/.netlify/functions/ai-proxy", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    return {
      configured: false,
      error: "AI parsing isn't reachable here (needs `netlify dev` or a deployed site, not a plain `vite` dev server).",
    };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    // The request reached a server but the reply wasn't JSON. A 200 like that is the plain
    // dev/preview server's HTML fallback — no functions runtime there. Anything else is the
    // hosting layer turning the request away before the function ran (e.g. Netlify's request
    // size cap), which "needs netlify dev" would describe wrongly on the live site.
    if (res.ok) {
      return {
        configured: false,
        error: "AI parsing isn't reachable here (needs `netlify dev` or a deployed site, not a plain `vite` dev server).",
      };
    }
    return {
      configured: false,
      error: `the request was turned away before reaching the AI (HTTP ${res.status}) — if a photo was attached, a smaller one may work.`,
    };
  }
  if (!res.ok) {
    return { configured: false, error: data.error || `Request failed (${res.status})` };
  }
  return data;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
