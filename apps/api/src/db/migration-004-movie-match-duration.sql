-- Migration 4: a movie's shown running time moves with the most common one, so matching keeps its
-- own, the first one known. A listing compared with a moving value could split off from its film.

ALTER TABLE movies ADD COLUMN match_duration_minutes INTEGER;
UPDATE movies SET match_duration_minutes = duration_minutes;
