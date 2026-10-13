CREATE TABLE `plan_override` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`expires_at` integer,
	`note` text,
	`granted_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `organization_detail` ADD `verification_status` text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization_detail` ADD `verification_message` text;--> statement-breakpoint
ALTER TABLE `organization_detail` ADD `verification_requested_at` integer;--> statement-breakpoint
ALTER TABLE `organization_detail` ADD `verification_reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `organization_detail` ADD `verification_reviewed_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `organization_detail` ADD `verification_method` text;--> statement-breakpoint
ALTER TABLE `organization_detail` ADD `verification_reason` text;--> statement-breakpoint
ALTER TABLE `organization_detail` ADD `verification_note` text;--> statement-breakpoint
-- Las organizaciones que ya estaban publicadas antes de existir la verificación quedan como verificadas.
UPDATE `organization_detail` SET `verification_status` = 'APPROVED', `verification_reviewed_at` = (cast(unixepoch('subsecond') * 1000 as integer)) WHERE `is_published` = 1;
