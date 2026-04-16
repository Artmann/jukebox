-- Full-text search across movies, shows, and episodes via SQLite FTS5.
--
-- We use external-content virtual tables (content='<source>',
-- content_rowid='rowid') so the FTS tables don't duplicate the underlying
-- title/overview text. Triggers keep the FTS shadow tables in sync with the
-- real source tables on every INSERT, UPDATE, and DELETE.
--
-- Episodes also need to match against the parent show title, which FTS5 can't
-- JOIN on. Triggers on `episodes` resolve `shows.title` at write time and
-- store it in the episodes_fts virtual table as a third column.

CREATE VIRTUAL TABLE `movies_fts` USING fts5(
  title,
  overview,
  genres,
  content='movies',
  content_rowid='rowid'
);
--> statement-breakpoint

CREATE VIRTUAL TABLE `shows_fts` USING fts5(
  title,
  overview,
  genres,
  content='shows',
  content_rowid='rowid'
);
--> statement-breakpoint

CREATE VIRTUAL TABLE `episodes_fts` USING fts5(
  title,
  overview,
  show_title,
  content='episodes',
  content_rowid='rowid'
);
--> statement-breakpoint

CREATE TRIGGER `movies_fts_insert` AFTER INSERT ON `movies` BEGIN
  INSERT INTO `movies_fts`(rowid, title, overview, genres)
  VALUES (NEW.rowid, NEW.title, NEW.overview, NEW.genres);
END;
--> statement-breakpoint

CREATE TRIGGER `movies_fts_delete` AFTER DELETE ON `movies` BEGIN
  INSERT INTO `movies_fts`(`movies_fts`, rowid, title, overview, genres)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.overview, OLD.genres);
END;
--> statement-breakpoint

CREATE TRIGGER `movies_fts_update` AFTER UPDATE ON `movies` BEGIN
  INSERT INTO `movies_fts`(`movies_fts`, rowid, title, overview, genres)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.overview, OLD.genres);
  INSERT INTO `movies_fts`(rowid, title, overview, genres)
  VALUES (NEW.rowid, NEW.title, NEW.overview, NEW.genres);
END;
--> statement-breakpoint

CREATE TRIGGER `shows_fts_insert` AFTER INSERT ON `shows` BEGIN
  INSERT INTO `shows_fts`(rowid, title, overview, genres)
  VALUES (NEW.rowid, NEW.title, NEW.overview, NEW.genres);
END;
--> statement-breakpoint

CREATE TRIGGER `shows_fts_delete` AFTER DELETE ON `shows` BEGIN
  INSERT INTO `shows_fts`(`shows_fts`, rowid, title, overview, genres)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.overview, OLD.genres);
END;
--> statement-breakpoint

CREATE TRIGGER `shows_fts_update` AFTER UPDATE ON `shows` BEGIN
  INSERT INTO `shows_fts`(`shows_fts`, rowid, title, overview, genres)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.overview, OLD.genres);
  INSERT INTO `shows_fts`(rowid, title, overview, genres)
  VALUES (NEW.rowid, NEW.title, NEW.overview, NEW.genres);
END;
--> statement-breakpoint

CREATE TRIGGER `episodes_fts_insert` AFTER INSERT ON `episodes` BEGIN
  INSERT INTO `episodes_fts`(rowid, title, overview, show_title)
  VALUES (
    NEW.rowid,
    NEW.title,
    NEW.overview,
    (SELECT `title` FROM `shows` WHERE `id` = NEW.show_id)
  );
END;
--> statement-breakpoint

CREATE TRIGGER `episodes_fts_delete` AFTER DELETE ON `episodes` BEGIN
  INSERT INTO `episodes_fts`(`episodes_fts`, rowid, title, overview, show_title)
  VALUES (
    'delete',
    OLD.rowid,
    OLD.title,
    OLD.overview,
    (SELECT `title` FROM `shows` WHERE `id` = OLD.show_id)
  );
END;
--> statement-breakpoint

CREATE TRIGGER `episodes_fts_update` AFTER UPDATE ON `episodes` BEGIN
  INSERT INTO `episodes_fts`(`episodes_fts`, rowid, title, overview, show_title)
  VALUES (
    'delete',
    OLD.rowid,
    OLD.title,
    OLD.overview,
    (SELECT `title` FROM `shows` WHERE `id` = OLD.show_id)
  );
  INSERT INTO `episodes_fts`(rowid, title, overview, show_title)
  VALUES (
    NEW.rowid,
    NEW.title,
    NEW.overview,
    (SELECT `title` FROM `shows` WHERE `id` = NEW.show_id)
  );
END;
--> statement-breakpoint

-- When a show's title changes, refresh the show_title column on every
-- matching episode_fts row. We can't use 'rebuild' here because
-- episodes_fts is external-content backed by `episodes`, which doesn't
-- know about the show title — so we issue a manual delete/insert per
-- affected episode rowid.
CREATE TRIGGER `episodes_fts_show_title_update` AFTER UPDATE OF `title` ON `shows` BEGIN
  INSERT INTO `episodes_fts`(`episodes_fts`, rowid, title, overview, show_title)
  SELECT 'delete', `episodes`.rowid, `episodes`.`title`, `episodes`.`overview`, OLD.`title`
  FROM `episodes`
  WHERE `episodes`.`show_id` = NEW.`id`;
  INSERT INTO `episodes_fts`(rowid, title, overview, show_title)
  SELECT `episodes`.rowid, `episodes`.`title`, `episodes`.`overview`, NEW.`title`
  FROM `episodes`
  WHERE `episodes`.`show_id` = NEW.`id`;
END;
--> statement-breakpoint

-- One-time backfill for any rows that already exist before this migration ran.
INSERT INTO `movies_fts`(rowid, title, overview, genres)
  SELECT rowid, title, overview, genres FROM `movies`;
--> statement-breakpoint

INSERT INTO `shows_fts`(rowid, title, overview, genres)
  SELECT rowid, title, overview, genres FROM `shows`;
--> statement-breakpoint

INSERT INTO `episodes_fts`(rowid, title, overview, show_title)
  SELECT
    `episodes`.rowid,
    `episodes`.`title`,
    `episodes`.`overview`,
    `shows`.`title`
  FROM `episodes`
  LEFT JOIN `shows` ON `shows`.`id` = `episodes`.`show_id`;
