CREATE TABLE `plan_setting` (
	`plan` text PRIMARY KEY NOT NULL,
	`price_mxn` integer,
	`trial_days` integer,
	`max_students` integer,
	`max_members` integer,
	`max_locations` integer,
	`reports` integer,
	`card_fee_bps` integer,
	`stripe_price_id` text,
	`retired_price_ids` text,
	`updated_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
