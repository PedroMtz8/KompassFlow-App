CREATE TABLE `pass_member` (
	`pass_id` text NOT NULL,
	`student_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`added_by` text,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`pass_id`) REFERENCES `student_pass`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_member_pass_student_uidx` ON `pass_member` (`pass_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `pass_member_student_idx` ON `pass_member` (`student_id`);--> statement-breakpoint
ALTER TABLE `product` ADD `seats` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `student_pass` ADD `seats` integer DEFAULT 1 NOT NULL;