ALTER TABLE `user` ADD `must_change_password` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `temp_password_expires_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `managed_by_org_id` text;