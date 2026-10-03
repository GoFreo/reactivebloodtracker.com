// All the chapter files, in file-name order, as one string. Kept in its own module so the whole
// guide is a single lazily loaded chunk: nobody downloads it until they open Help.
const files = import.meta.glob("./chapters/*.html", { query: "?raw", import: "default", eager: true });

export const CHAPTERS_HTML = Object.keys(files)
  .sort()
  .map((name) => files[name])
  .join("\n");
