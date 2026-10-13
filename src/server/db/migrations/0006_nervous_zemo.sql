CREATE TABLE `class_session` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`service_id` text NOT NULL,
	`series_id` text,
	`room_id` text,
	`instructor_user_id` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`capacity` integer NOT NULL,
	`status` text DEFAULT 'SCHEDULED' NOT NULL,
	`canceled_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `session_series`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`instructor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `session_org_status_starts_idx` ON `class_session` (`organization_id`,`status`,`starts_at`);--> statement-breakpoint
CREATE INDEX `session_room_starts_idx` ON `class_session` (`room_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `session_instructor_starts_idx` ON `class_session` (`instructor_user_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `session_service_starts_idx` ON `class_session` (`service_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `session_series_idx` ON `class_session` (`series_id`);--> statement-breakpoint
CREATE TABLE `service` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'GROUP' NOT NULL,
	`discipline_id` text,
	`level` text DEFAULT 'ALL' NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`duration_min` integer NOT NULL,
	`default_capacity` integer,
	`cover_image` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`discipline_id`) REFERENCES `discipline`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `service_org_active_idx` ON `service` (`organization_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `service_discipline_idx` ON `service` (`discipline_id`);--> statement-breakpoint
CREATE TABLE `session_series` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`service_id` text NOT NULL,
	`room_id` text,
	`instructor_user_id` text,
	`capacity` integer NOT NULL,
	`weekdays` text NOT NULL,
	`start_time` text NOT NULL,
	`duration_min` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`timezone` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`instructor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `series_org_idx` ON `session_series` (`organization_id`);--> statement-breakpoint
CREATE INDEX `series_service_idx` ON `session_series` (`service_id`);