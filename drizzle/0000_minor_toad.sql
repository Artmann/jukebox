CREATE TABLE `movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`file_path` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer,
	`extension` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`tmdb_id` integer,
	`year` integer,
	`overview` text,
	`runtime` integer,
	`genres` text,
	`rating` real,
	`poster_path` text,
	`backdrop_path` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_file_path_unique` ON `movies` (`file_path`);--> statement-breakpoint
CREATE TABLE `watch_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL,
	`current_time` integer NOT NULL,
	`duration` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE no action
);
