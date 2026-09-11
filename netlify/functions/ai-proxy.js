// Proxies food-photo/text parsing to the Anthropic API so the API key never
// reaches the client — same pattern as SfumatoART's netlify/functions/ai-proxy.js.
// Returns { configured: false, error } until ANTHROPIC_API_KEY is set in the
// Netlify environment (Scott hasn't generated a dedicated key for this project yet).

const MODEL = "claude-haiku-4-5-20251001"; // cheap + fast; fine for structured single-item parsing — bump if quality isn't enough

const SYSTEM_PROMPT = `You are helping someone with reactive hypoglycemia log a meal. You will be given a text description and/or a food photo. Identify the food, estimate the portion, and rate your own confidence honestly — mixed or restaurant dishes with hidden oils/sauces are hard to estimate accurately, so say so rather than guessing with false confidence. If your confidence is below 70, include ONE specific clarifying question that would most improve the estimate (e.g. "Was that pan-fried or grilled?"). Respond ONLY with JSON matching this shape, no other text, no markdown fences:
{"foodName": string, "portionEstimate": string, "confidencePercent": number, "assumptions": string, "clarifyingQuestion": string or null}`;

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      body: JSON.stringify({ configured: false, error: "ANTHROPIC_API_KEY isn't set yet." }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { text, imageBase64, mimeType } = payload;
  if (!text && !imageBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: "Provide text and/or imageBase64" }) };
  }

  const contentBlocks = [];
  if (imageBase64) {
    contentBlocks.push({
      type: "image",
      source: { type: "base64", media_type: mimeType || "image/jpeg", data: imageBase64 },
    });
  }
  contentBlocks.push({ type: "text", text: text || "No text description provided — use the photo alone." });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: data.error?.message || "Anthropic API error" }) };
    }

    const rawText = data.content?.[0]?.text || "";
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Claude's response wasn't valid JSON", raw: rawText }),
      };
    }

    return { statusCode: 200, body: JSON.stringify({ configured: true, ...parsed }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message || "Request to Anthropic failed" }) };
  }
};
