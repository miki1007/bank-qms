CREATE TABLE `qms_demo_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `qms_demo_staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `qms_demo_audit_created_idx` ON `qms_demo_audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `qms_demo_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`staff_id`) REFERENCES `qms_demo_staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qms_demo_sessions_token_hash_unique` ON `qms_demo_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `qms_demo_session_staff_idx` ON `qms_demo_sessions` (`staff_id`);--> statement-breakpoint
CREATE TABLE `qms_demo_staff` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`failed_login_count` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_login_at` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qms_demo_staff_username_unique` ON `qms_demo_staff` (`username`);--> statement-breakpoint
CREATE INDEX `qms_demo_staff_role_idx` ON `qms_demo_staff` (`role`,`active`);--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `lookup_token_hash` text;