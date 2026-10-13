CREATE TABLE `student_link_code` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`student_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_link_code_hash_uidx` ON `student_link_code` (`code_hash`);--> statement-breakpoint
CREATE INDEX `student_link_code_student_idx` ON `student_link_code` (`student_id`);