CREATE TABLE `booking` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text DEFAULT 'CONFIRMED' NOT NULL,
	`source` text NOT NULL,
	`created_by` text,
	`canceled_at` integer,
	`canceled_by` text,
	`cancel_reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `class_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`canceled_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_session_student_active_uidx` ON `booking` (`session_id`,`student_id`) WHERE status = 'CONFIRMED';--> statement-breakpoint
CREATE INDEX `booking_session_status_idx` ON `booking` (`session_id`,`status`);--> statement-breakpoint
CREATE INDEX `booking_student_created_idx` ON `booking` (`student_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `booking_org_created_idx` ON `booking` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `student` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`level` text DEFAULT 'NEW' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_org_user_uidx` ON `student` (`organization_id`,`user_id`) WHERE user_id is not null;--> statement-breakpoint
CREATE INDEX `student_org_name_idx` ON `student` (`organization_id`,`name`);--> statement-breakpoint
CREATE INDEX `student_org_phone_idx` ON `student` (`organization_id`,`phone`);--> statement-breakpoint
CREATE INDEX `student_user_idx` ON `student` (`user_id`);--> statement-breakpoint
ALTER TABLE `organization_detail` ADD `cancel_window_hours` integer DEFAULT 4 NOT NULL;