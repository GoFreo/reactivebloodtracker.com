// Local, non-AI "recent foods" suggestions — repeat a common meal with one tap
// instead of retyping it. Pure frequency+recency over what's already saved;
// no network call, works offline, costs nothing.
export function getFoodSuggestions(foodEntries, limit = 6) {
  const counts = new Map();
  for (const entry of foodEntries) {
    const text = (entry.text || "").trim();
    if (!text) continue;
    const existing = counts.get(text);
    if (existing) {
      existing.count += 1;
      if (entry.timestamp > existing.lastUsed) existing.lastUsed = entry.timestamp;
    } else {
      counts.set(text, { text, count: 1, lastUsed: entry.timestamp });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || (b.lastUsed > a.lastUsed ? 1 : -1))
    .slice(0, limit);
}

export function shortLabel(text, maxLen = 28) {
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}
