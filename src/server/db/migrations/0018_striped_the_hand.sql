ALTER TABLE `payment` ADD `stripe_session_id` text;--> statement-breakpoint
ALTER TABLE `payment` ADD `stripe_payment_intent_id` text;--> statement-breakpoint
ALTER TABLE `payment` ADD `fee_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment` ADD `refunded_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `payment_stripe_session_uidx` ON `payment` (`stripe_session_id`) WHERE "payment"."stripe_session_id" is not null;--> statement-breakpoint
ALTER TABLE `payment_settings` ADD `stripe_account_id` text;--> statement-breakpoint
ALTER TABLE `payment_settings` ADD `stripe_charges_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_settings` ADD `stripe_payouts_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_settings` ADD `stripe_details_submitted` integer DEFAULT false NOT NULL;