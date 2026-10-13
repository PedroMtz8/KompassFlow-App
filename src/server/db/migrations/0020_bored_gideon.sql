CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_user_created_idx` ON `notification` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_user_unread_idx` ON `notification` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `notification_dedupe` (
	`key` text PRIMARY KEY NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_pref` (
	`user_id` text PRIMARY KEY NOT NULL,
	`reminders` integer DEFAULT true NOT NULL,
	`class_changes` integer DEFAULT true NOT NULL,
	`payments` integer DEFAULT true NOT NULL,
	`team` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_token` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`platform` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_token_token_uidx` ON `push_token` (`token`);--> statement-breakpoint
CREATE INDEX `push_token_user_idx` ON `push_token` (`user_id`);