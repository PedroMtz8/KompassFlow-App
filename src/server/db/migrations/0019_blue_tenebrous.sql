CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text,
	`count` integer,
	`last_request` integer
);
--> statement-breakpoint
CREATE TABLE `app_rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_start` integer NOT NULL
);
