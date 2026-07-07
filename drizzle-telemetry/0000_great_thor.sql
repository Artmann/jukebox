CREATE TABLE `errors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trace_id` text,
	`span_id` text,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`message` text NOT NULL,
	`stack` text,
	`url` text,
	`attributes` text DEFAULT '{}' NOT NULL,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `errors_created_idx` ON `errors` (`created_at`);--> statement-breakpoint
CREATE INDEX `errors_trace_idx` ON `errors` (`trace_id`);--> statement-breakpoint
CREATE INDEX `errors_source_idx` ON `errors` (`source`);--> statement-breakpoint
CREATE TABLE `spans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trace_id` text NOT NULL,
	`span_id` text NOT NULL,
	`parent_span_id` text,
	`name` text NOT NULL,
	`kind` text DEFAULT 'internal' NOT NULL,
	`source` text NOT NULL,
	`route` text,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`duration_ms` real NOT NULL,
	`status_code` text DEFAULT 'unset' NOT NULL,
	`status_message` text,
	`attributes` text DEFAULT '{}' NOT NULL,
	`events` text DEFAULT '[]' NOT NULL,
	`resource` text DEFAULT '{}' NOT NULL,
	`session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `spans_trace_id_idx` ON `spans` (`trace_id`);--> statement-breakpoint
CREATE INDEX `spans_trace_start_idx` ON `spans` (`trace_id`,`start_time`);--> statement-breakpoint
CREATE INDEX `spans_status_idx` ON `spans` (`status_code`);--> statement-breakpoint
CREATE INDEX `spans_created_idx` ON `spans` (`created_at`);--> statement-breakpoint
CREATE INDEX `spans_parent_idx` ON `spans` (`parent_span_id`);--> statement-breakpoint
CREATE INDEX `spans_route_idx` ON `spans` (`route`);