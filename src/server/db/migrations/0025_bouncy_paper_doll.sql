CREATE TABLE `user_suspension` (
	`user_id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`suspended_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`suspended_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
