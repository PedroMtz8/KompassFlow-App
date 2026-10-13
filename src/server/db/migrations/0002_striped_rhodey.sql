CREATE TABLE `discipline` (
	`id` text PRIMARY KEY NOT NULL,
	`vertical_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`vertical_id`) REFERENCES `vertical`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discipline_vertical_slug_uidx` ON `discipline` (`vertical_id`,`slug`);--> statement-breakpoint
CREATE INDEX `discipline_vertical_sort_idx` ON `discipline` (`vertical_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `user_interest` (
	`user_id` text NOT NULL,
	`discipline_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `discipline_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`discipline_id`) REFERENCES `discipline`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_interest_discipline_idx` ON `user_interest` (`discipline_id`);--> statement-breakpoint
CREATE TABLE `user_vertical` (
	`user_id` text NOT NULL,
	`vertical_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `vertical_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vertical_id`) REFERENCES `vertical`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_vertical_vertical_idx` ON `user_vertical` (`vertical_id`);--> statement-breakpoint
CREATE TABLE `vertical` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vertical_slug_uidx` ON `vertical` (`slug`);--> statement-breakpoint
CREATE INDEX `vertical_active_sort_idx` ON `vertical` (`is_active`,`sort_order`);