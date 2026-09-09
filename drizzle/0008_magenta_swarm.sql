CREATE TABLE `qms_customer_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_subject` text NOT NULL,
	`account_type` text NOT NULL,
	`account_name` text NOT NULL,
	`masked_number` text NOT NULL,
	`currency` text DEFAULT 'ETB' NOT NULL,
	`ledger_balance_minor` integer NOT NULL,
	`available_balance_minor` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qms_customer_account_type_unique` ON `qms_customer_accounts` (`customer_subject`,`account_type`);--> statement-breakpoint
CREATE INDEX `qms_customer_accounts_subject_idx` ON `qms_customer_accounts` (`customer_subject`);--> statement-breakpoint
CREATE TABLE `qms_customer_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`posted_at` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`balance_minor` integer NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`reference` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `qms_customer_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qms_customer_transaction_reference_unique` ON `qms_customer_transactions` (`reference`);--> statement-breakpoint
CREATE INDEX `qms_customer_transactions_account_posted_idx` ON `qms_customer_transactions` (`account_id`,`posted_at`);--> statement-breakpoint
CREATE TABLE `qms_service_configuration` (
	`branch_code` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`target_minutes` integer NOT NULL,
	`priority_enabled` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`branch_code`, `code`)
);
--> statement-breakpoint
CREATE INDEX `qms_service_configuration_active_idx` ON `qms_service_configuration` (`branch_code`,`active`);--> statement-breakpoint
ALTER TABLE `qms_demo_staff` ADD `assigned_service_code` text;