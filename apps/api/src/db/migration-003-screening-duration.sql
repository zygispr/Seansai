-- Migration 3: each screening keeps the running time its cinema listed, because cinemas disagree
-- (some include ads and trailers). A movie shows the most common one across its screenings.

ALTER TABLE screenings ADD COLUMN duration_minutes INTEGER;
