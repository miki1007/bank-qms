CREATE TABLE `qms_branches` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'Africa/Addis_Ababa' NOT NULL,
	`priority_limit` integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qms_branch_fairness` (
	`branch_code` text NOT NULL,
	`service_code` text NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`branch_code`, `service_code`)
);
--> statement-breakpoint
CREATE TABLE `qms_branch_sequences` (
	`branch_code` text NOT NULL,
	`service_code` text NOT NULL,
	`business_date` text NOT NULL,
	`next_value` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`branch_code`, `service_code`, `business_date`)
);
--> statement-breakpoint
CREATE TABLE `qms_counter_operations` (
	`branch_code` text NOT NULL,
	`counter` text NOT NULL,
	`staff_id` text,
	`service_code` text NOT NULL,
	`status` text DEFAULT 'CLOSED' NOT NULL,
	`opened_at` text,
	PRIMARY KEY(`branch_code`, `counter`)
);
--> statement-breakpoint
CREATE TABLE `qms_operation_replays` (
	`actor_id` text NOT NULL,
	`request_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`ticket_id` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`actor_id`, `request_key`)
);
--> statement-breakpoint
CREATE TABLE `qms_request_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
DROP INDEX `qms_demo_ticket_number_per_day_unique`;--> statement-breakpoint
DROP INDEX `qms_demo_queue_idx`;--> statement-breakpoint
DROP INDEX `qms_demo_active_counter_idx`;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `branch_code` text DEFAULT 'SUMMIT' NOT NULL;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `customer_subject` text;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `request_hash` text;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `channel` text DEFAULT 'KIOSK' NOT NULL;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `check_in_opens_at` text;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `check_in_deadline` text;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `checked_in_at` text;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `priority_requested` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `priority_verified_by` text;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `no_show_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `qms_demo_ticket_number_per_branch_day_unique` ON `qms_demo_tickets` (`branch_code`,`business_date`,`public_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `qms_ticket_idempotency_unique` ON `qms_demo_tickets` (`branch_code`,`customer_subject`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `qms_customer_active_ticket_unique` ON `qms_demo_tickets` (`branch_code`,`customer_subject`) WHERE "qms_demo_tickets"."customer_subject" IS NOT NULL AND "qms_demo_tickets"."status" IN ('RESERVED', 'WAITING', 'CALLED', 'IN_SERVICE', 'NO_SHOW');--> statement-breakpoint
CREATE INDEX `qms_demo_queue_idx` ON `qms_demo_tickets` (`branch_code`,`status`,`service_code`,`priority`,`queue_entered_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `qms_demo_active_counter_idx` ON `qms_demo_tickets` (`branch_code`,`counter`) WHERE "qms_demo_tickets"."status" IN ('CALLED', 'IN_SERVICE');--> statement-breakpoint
DROP INDEX `qms_demo_staff_counter_unique`;--> statement-breakpoint
ALTER TABLE `qms_demo_staff` ADD `branch_code` text DEFAULT 'SUMMIT' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `qms_demo_staff_counter_unique` ON `qms_demo_staff` (`branch_code`,`assigned_counter`);--> statement-breakpoint
ALTER TABLE `qms_demo_audit` ADD `branch_code` text DEFAULT 'SUMMIT' NOT NULL;--> statement-breakpoint
ALTER TABLE `qms_demo_events` ADD `branch_code` text DEFAULT 'SUMMIT' NOT NULL;