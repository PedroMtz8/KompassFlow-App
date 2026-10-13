CREATE TABLE `instructor_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `availability_org_user_weekday_idx` ON `instructor_availability` (`organization_id`,`user_id`,`weekday`);--> statement-breakpoint
ALTER TABLE `service` ADD `instructor_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `service` ADD `buffer_min` integer DEFAULT 0 NOT NULL;