import { addEntry, getAllEntries } from "./db.js";

// `extra` carries optional tags — e.g. the spike prompt's excursionId/answer,
// which is how an answered question stays answered across refreshes.
export async function saveDiaryNote({ text, timestamp, ...extra }) {
  return addEntry("diary", { type: "diary", text, timestamp, ...extra });
}

export async function listDiaryNotes() {
  return getAllEntries("diary");
}
