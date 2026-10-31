-- Initial schema (migration 1). Instants are ISO 8601 UTC strings (`toISOString()`), so they sort
-- and compare as text; calendar dates are `YYYY-MM-DD` in Europe/Vilnius (data-model.md).

CREATE TABLE sources (
  id              TEXT PRIMARY KEY,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error      TEXT
) STRICT;

CREATE TABLE movies (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  original_title    TEXT,
  match_key         TEXT NOT NULL,
  year              INTEGER,
  duration_minutes  INTEGER,
  age_rating        TEXT,
  genres            TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(genres)),
  poster_url        TEXT,
  last_screening_at TEXT,
  UNIQUE (match_key, year)
) STRICT;

CREATE TABLE screenings (
  id                TEXT PRIMARY KEY, -- "{sourceId}:{sourceScreeningId}"
  source_id         TEXT NOT NULL,
  movie_id          TEXT NOT NULL REFERENCES movies (id),
  cinema_id         TEXT NOT NULL,
  starts_at         TEXT NOT NULL,
  local_date        TEXT NOT NULL,
  hall              TEXT,
  format            TEXT CHECK (format IN ('2D', '3D', 'IMAX', '4DX', 'ScreenX', 'other')),
  spoken_language   TEXT,
  subtitle_language TEXT,
  is_dubbed         INTEGER CHECK (is_dubbed IN (0, 1)),
  ticket_url        TEXT NOT NULL,
  source_title      TEXT NOT NULL,
  refreshed_at      TEXT NOT NULL
) STRICT;

CREATE INDEX screenings_by_date_and_cinema ON screenings (local_date, cinema_id);
CREATE INDEX screenings_by_movie_and_date ON screenings (movie_id, local_date);
CREATE INDEX screenings_by_source_and_start ON screenings (source_id, starts_at);

CREATE TABLE match_reviews (
  id            INTEGER PRIMARY KEY,
  match_key     TEXT NOT NULL,
  -- A review is moot once either movie is gone (movies are deleted 30 days after their last
  -- screening), so it goes with them.
  movie_id_a    TEXT NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  movie_id_b    TEXT NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  reason        TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  resolution    TEXT CHECK (resolution IN ('merge', 'keep-separate')),
  UNIQUE (movie_id_a, movie_id_b)
) STRICT;
