CREATE TABLE `qms_demo_events` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text,
	`type` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qms_demo_sequences` (
	`service_code` text NOT NULL,
	`business_date` text NOT NULL,
	`next_value` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`service_code`, `business_date`)
);
--> statement-breakpoint
CREATE TABLE `qms_demo_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`priority_streak` integer DEFAULT 0 NOT NULL,
	`priority_limit` integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qms_demo_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`public_number` text NOT NULL,
	`service_code` text NOT NULL,
	`service_name` text NOT NULL,
	`priority` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'WAITING' NOT NULL,
	`counter` text,
	`created_at` text NOT NULL,
	`called_at` text,
	`started_at` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qms_demo_tickets_public_number_unique` ON `qms_demo_tickets` (`public_number`);--> statement-breakpoint
CREATE INDEX `qms_demo_queue_idx` ON `qms_demo_tickets` (`status`,`service_code`,`priority`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `qms_demo_active_counter_idx` ON `qms_demo_tickets` (`counter`) WHERE "qms_demo_tickets"."status" IN ('CALLED', 'IN_SERVICE');