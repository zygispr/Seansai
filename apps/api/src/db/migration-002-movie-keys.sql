-- Migration 2: a movie is known by several titles (English, original, Lithuanian), and listings
-- match on any of them (FR-005). The English title is shown under the Lithuanian one.

ALTER TABLE movies ADD COLUMN english_title TEXT;

CREATE TABLE movie_keys (
  movie_id TEXT NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  PRIMARY KEY (movie_id, key)
) STRICT, WITHOUT ROWID;

CREATE INDEX movie_keys_by_key ON movie_keys (key);

INSERT INTO movie_keys (movie_id, key) SELECT id, match_key FROM movies;
