import { addEntry, getAllEntries } from "./db.js";

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
    body.imageBase64 = await blobToBase64(photoBlob);
    body.mimeType = photoBlob.type || "image/jpeg";
  }

  try {
    const headers = { "Content-Type": "application/json" };
    // Only present if VITE_APP_SHARED_SECRET was set at build time — see ai-proxy.js.
    const sharedSecret = import.meta.env.VITE_APP_SHARED_SECRET;
    if (sharedSecret) headers["x-app-secret"] = sharedSecret;

    const res = await fetch("/.netlify/functions/ai-proxy", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { configured: false, error: data.error || `Request failed (${res.status})` };
    }
    return data;
  } catch {
    return {
      configured: false,
      error: "AI parsing isn't reachable here (needs `netlify dev` or a deployed site, not a plain `vite` dev server).",
    };
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
