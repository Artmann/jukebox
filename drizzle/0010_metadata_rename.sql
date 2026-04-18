-- Migration: rename TMDB-specific columns to neutral "external_id" +
-- "poster_url"/"backdrop_url"/"still_url" so the project can talk to any
-- metadata API. Also drop the tmdbApiKey setting row since we no longer
-- store a key.
--
-- The stored poster/backdrop/still values used to be relative TMDB paths
-- (e.g. "/abc.jpg") and the frontend prefixed image.tmdb.org. The new API
-- returns absolute URLs, so we null out the old values — a re-scan will
-- repopulate them with fully-qualified URLs.
--
-- SQLite 3.35+ supports RENAME COLUMN and DROP COLUMN, which better-sqlite3
-- ships with, so we can do this in-place without table recreation.

-- movies ---------------------------------------------------------------
ALTER TABLE `movies` ADD COLUMN `external_id` text;--> statement-breakpoint
UPDATE `movies` SET `external_id` = CAST(`tmdb_id` AS TEXT) WHERE `tmdb_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `movies` DROP COLUMN `tmdb_id`;--> statement-breakpoint

ALTER TABLE `movies` RENAME COLUMN `poster_path` TO `poster_url`;--> statement-breakpoint
ALTER TABLE `movies` RENAME COLUMN `backdrop_path` TO `backdrop_url`;--> statement-breakpoint

UPDATE `movies` SET `poster_url` = NULL WHERE `poster_url` IS NOT NULL;--> statement-breakpoint
UPDATE `movies` SET `backdrop_url` = NULL WHERE `backdrop_url` IS NOT NULL;--> statement-breakpoint

-- shows ----------------------------------------------------------------
ALTER TABLE `shows` ADD COLUMN `external_id` text;--> statement-breakpoint
UPDATE `shows` SET `external_id` = CAST(`tmdb_id` AS TEXT) WHERE `tmdb_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `shows` DROP COLUMN `tmdb_id`;--> statement-breakpoint

ALTER TABLE `shows` RENAME COLUMN `poster_path` TO `poster_url`;--> statement-breakpoint
ALTER TABLE `shows` RENAME COLUMN `backdrop_path` TO `backdrop_url`;--> statement-breakpoint

UPDATE `shows` SET `poster_url` = NULL WHERE `poster_url` IS NOT NULL;--> statement-breakpoint
UPDATE `shows` SET `backdrop_url` = NULL WHERE `backdrop_url` IS NOT NULL;--> statement-breakpoint

-- seasons --------------------------------------------------------------
ALTER TABLE `seasons` RENAME COLUMN `poster_path` TO `poster_url`;--> statement-breakpoint
UPDATE `seasons` SET `poster_url` = NULL WHERE `poster_url` IS NOT NULL;--> statement-breakpoint

-- episodes -------------------------------------------------------------
-- episodes.tmdb_id was never populated (always null), so no copy needed.
ALTER TABLE `episodes` ADD COLUMN `external_id` text;--> statement-breakpoint
ALTER TABLE `episodes` DROP COLUMN `tmdb_id`;--> statement-breakpoint

ALTER TABLE `episodes` RENAME COLUMN `still_path` TO `still_url`;--> statement-breakpoint
UPDATE `episodes` SET `still_url` = NULL WHERE `still_url` IS NOT NULL;--> statement-breakpoint

-- settings: drop the unused TMDB API key row ---------------------------
DELETE FROM `settings` WHERE `key` = 'tmdbApiKey';
