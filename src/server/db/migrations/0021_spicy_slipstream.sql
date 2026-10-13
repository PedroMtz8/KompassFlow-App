CREATE TABLE `waitlist_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text DEFAULT 'WAITING' NOT NULL,
	`offered_at` integer,
	`offer_expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `class_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waitlist_active_uidx` ON `waitlist_entry` (`session_id`,`student_id`) WHERE "waitlist_entry"."status" in ('WAITING', 'OFFERED');--> statement-breakpoint
CREATE INDEX `waitlist_session_status_idx` ON `waitlist_entry` (`session_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `waitlist_student_idx` ON `waitlist_entry` (`student_id`,`status`);