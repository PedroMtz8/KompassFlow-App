CREATE TABLE `organization_role` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `organizationRole_organizationId_idx` ON `organization_role` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organizationRole_role_idx` ON `organization_role` (`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_role_org_role_uidx` ON `organization_role` (`organization_id`,`role`);