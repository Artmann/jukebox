PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_watch_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`movie_id` integer,
	`episode_id` integer,
	`current_time` integer NOT NULL,
	`duration` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_watch_progress`("id", "profile_id", "movie_id", "episode_id", "current_time", "duration", "updated_at") SELECT "id", "profile_id", "movie_id", "episode_id", "current_time", "duration", "updated_at" FROM `watch_progress`;--> statement-breakpoint
DROP TABLE `watch_progress`;--> statement-breakpoint
ALTER TABLE `__new_watch_progress` RENAME TO `watch_progress`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `watch_progress_profile_movie_idx` ON `watch_progress` (`profile_id`,`movie_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `watch_progress_profile_episode_idx` ON `watch_progress` (`profile_id`,`episode_id`);