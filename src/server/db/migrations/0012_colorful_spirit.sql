CREATE TABLE `cash_close` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`expected_cents` integer NOT NULL,
	`counted_cents` integer NOT NULL,
	`note` text,
	`closed_by` text,
	`closed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`closed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cash_close_org_closed_idx` ON `cash_close` (`organization_id`,`closed_at`);--> statement-breakpoint
CREATE TABLE `payment` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`student_id` text NOT NULL,
	`product_id` text,
	`concept` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`reference` text,
	`tracking_key` text,
	`note` text,
	`created_by` text,
	`confirmed_by` text,
	`paid_at` integer,
	`cash_close_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`confirmed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cash_close_id`) REFERENCES `cash_close`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `payment_org_status_paid_idx` ON `payment` (`organization_id`,`status`,`paid_at`);--> statement-breakpoint
CREATE INDEX `payment_student_created_idx` ON `payment` (`student_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_org_method_close_idx` ON `payment` (`organization_id`,`method`,`cash_close_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_org_reference_uidx` ON `payment` (`organization_id`,`reference`) WHERE "payment"."reference" is not null;--> statement-breakpoint
CREATE TABLE `payment_settings` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`accepts_cash` integer DEFAULT true NOT NULL,
	`accepts_transfer` integer DEFAULT false NOT NULL,
	`bank` text,
	`clabe` text,
	`beneficiary` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text NOT NULL,
	`price_cents` integer NOT NULL,
	`credits` integer,
	`validity_days` integer,
	`is_visible` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_org_active_idx` ON `product` (`organization_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `student_pass` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`student_id` text NOT NULL,
	`product_id` text,
	`payment_id` text,
	`name` text NOT NULL,
	`credits_total` integer,
	`starts_at` integer NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `payment`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pass_student_starts_idx` ON `student_pass` (`student_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `pass_org_product_idx` ON `student_pass` (`organization_id`,`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pass_payment_uidx` ON `student_pass` (`payment_id`) WHERE "student_pass"."payment_id" is not null;