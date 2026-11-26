-- D1 database "kutub-mashkulah-readers" (binding DB on the Pages project): reading progress of signed-in readers.
-- functions/api/progress.js also makes this table itself on first use.
-- sub = Google account number; data = JSON {slug: {s: "paragraph:fraction", p: 0..1, d: read to the end, t: ms time}}.
CREATE TABLE IF NOT EXISTS reading (sub TEXT PRIMARY KEY, data TEXT NOT NULL, t INTEGER NOT NULL);
-- functions/api/exercises.js: interactive exercise answers per (reader, book), data = JSON {fieldId: {v, t}}.
CREATE TABLE IF NOT EXISTS exercises (sub TEXT NOT NULL, slug TEXT NOT NULL, data TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (sub, slug));
