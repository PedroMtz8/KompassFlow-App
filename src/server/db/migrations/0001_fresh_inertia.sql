CREATE UNIQUE INDEX `account_provider_account_uidx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `invitation_org_status_idx` ON `invitation` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `invitation_email_status_idx` ON `invitation` (`email`,`status`);--> statement-breakpoint
CREATE INDEX `invitation_inviterId_idx` ON `invitation` (`inviter_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_org_user_uidx` ON `member` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `session_expiresAt_idx` ON `session` (`expires_at`);--> statement-breakpoint
CREATE INDEX `verification_expiresAt_idx` ON `verification` (`expires_at`);