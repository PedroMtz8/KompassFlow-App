CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_org_created_idx` ON `audit_log` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_log` (`actor_user_id`);--> statement-breakpoint
CREATE TABLE `location` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text,
	`address` text NOT NULL,
	`neighborhood` text,
	`city` text NOT NULL,
	`lat` real,
	`lng` real,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `location_org_idx` ON `location` (`organization_id`);--> statement-breakpoint
CREATE INDEX `location_geo_idx` ON `location` (`lat`,`lng`);--> statement-breakpoint
CREATE TABLE `organization_detail` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`vertical_id` text NOT NULL,
	`description` text,
	`phone` text,
	`instagram` text,
	`website` text,
	`cover_image` text,
	`timezone` text DEFAULT 'America/Mexico_City' NOT NULL,
	`currency` text DEFAULT 'MXN' NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vertical_id`) REFERENCES `vertical`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `org_detail_published_vertical_idx` ON `organization_detail` (`is_published`,`vertical_id`,`type`);--> statement-breakpoint
CREATE INDEX `org_detail_vertical_idx` ON `organization_detail` (`vertical_id`);--> statement-breakpoint
CREATE TABLE `room` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`location_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_location_name_uidx` ON `room` (`location_id`,`name`);--> statement-breakpoint
CREATE INDEX `room_org_idx` ON `room` (`organization_id`);--> statement-breakpoint
ALTER TABLE `vertical` ADD `terms` text;