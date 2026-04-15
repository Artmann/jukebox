CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_name_unique` ON `profiles` (`name`);--> statement-breakpoint
INSERT INTO `profiles` (`id`, `name`, `emoji`, `created_at`) VALUES (1, 'Default', '🍿', unixepoch());--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`movie_id` integer,
	`show_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_profile_movie_idx` ON `favorites` (`profile_id`,`movie_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_profile_show_idx` ON `favorites` (`profile_id`,`show_id`);--> statement-breakpoint
CREATE TABLE `__new_watch_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`movie_id` integer,
	`episode_id` integer,
	`current_time` integer NOT NULL,
	`duration` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_watch_progress` (`id`, `profile_id`, `movie_id`, `episode_id`, `current_time`, `duration`, `updated_at`)
SELECT `id`, 1, `movie_id`, `episode_id`, `current_time`, `duration`, `updated_at` FROM `watch_progress`;
--> statement-breakpoint
DROP TABLE `watch_progress`;--> statement-breakpoint
ALTER TABLE `__new_watch_progress` RENAME TO `watch_progress`;--> statement-breakpoint
CREATE UNIQUE INDEX `watch_progress_profile_movie_idx` ON `watch_progress` (`profile_id`,`movie_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `watch_progress_profile_episode_idx` ON `watch_progress` (`profile_id`,`episode_id`);
