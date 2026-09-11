import { addEntry, getAllEntries } from "./db.js";

export async function saveFoodEntry({ text, photoBlob, timestamp, aiResult }) {
  return addEntry("food", {
    type: "food",
    text: text || "",
    photoBlob: photoBlob || null,
    timestamp,
    aiResult: aiResult || null,
  });
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
    const res = await fetch("/.netlify/functions/ai-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
