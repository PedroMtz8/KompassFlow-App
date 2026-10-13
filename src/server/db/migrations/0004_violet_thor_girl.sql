CREATE TABLE `zone` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`state` text,
	`country` text DEFAULT 'MX' NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`timezone` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `zone`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `zone_slug_uidx` ON `zone` (`slug`);--> statement-breakpoint
CREATE INDEX `zone_parent_sort_idx` ON `zone` (`parent_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `zone_kind_active_idx` ON `zone` (`kind`,`is_active`);--> statement-breakpoint
CREATE INDEX `zone_geo_idx` ON `zone` (`lat`,`lng`);--> statement-breakpoint
ALTER TABLE `location` ADD `zone_id` text REFERENCES zone(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `location_zone_idx` ON `location` (`zone_id`);