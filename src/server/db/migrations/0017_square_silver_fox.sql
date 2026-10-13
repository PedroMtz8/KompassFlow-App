CREATE TABLE `member_extra_permission` (
	`member_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`permission` text NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `member_extra_permission_org_idx` ON `member_extra_permission` (`organization_id`);