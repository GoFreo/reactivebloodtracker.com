import { addEntry, getAllEntries } from "./db.js";

export async function saveDiaryNote({ text, timestamp }) {
  return addEntry("diary", { type: "diary", text, timestamp });
}

export async function listDiaryNotes() {
  return getAllEntries("diary");
}
