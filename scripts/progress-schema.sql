-- D1 database "kutub-mashkulah-readers" (binding DB on the Pages project): reading progress of signed-in readers.
-- sub = Google account number; place = "paragraph:fraction" (progress.js); p = 0..1 how far; done = read to the end; t = ms time.
CREATE TABLE IF NOT EXISTS progress (
  sub TEXT NOT NULL,
  slug TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  p REAL,
  done INTEGER NOT NULL DEFAULT 0,
  t INTEGER NOT NULL,
  PRIMARY KEY (sub, slug)
);
