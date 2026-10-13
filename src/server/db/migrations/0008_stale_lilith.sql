CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`session_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text NOT NULL,
	`marked_by` text,
	`marked_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `class_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_booking_uidx` ON `attendance` (`booking_id`);--> statement-breakpoint
CREATE INDEX `attendance_session_status_idx` ON `attendance` (`session_id`,`status`);--> statement-breakpoint
CREATE INDEX `attendance_student_marked_idx` ON `attendance` (`student_id`,`marked_at`);--> statement-breakpoint
CREATE INDEX `attendance_org_marked_idx` ON `attendance` (`organization_id`,`marked_at`);--> statement-breakpoint
ALTER TABLE `class_session` ADD `attendance_closed_at` integer;