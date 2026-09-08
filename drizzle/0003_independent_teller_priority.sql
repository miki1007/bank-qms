CREATE TABLE `qms_demo_priority_state` (
	`service_code` text PRIMARY KEY NOT NULL,
	`priority_streak` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `qms_demo_priority_state_streak_idx` ON `qms_demo_priority_state` (`priority_streak`);--> statement-breakpoint
DROP INDEX `qms_demo_queue_idx`;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `priority_reason` text;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `queue_entered_at` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `qms_demo_tickets`
SET `queue_entered_at` = `created_at`
WHERE `queue_entered_at` = '';--> statement-breakpoint
CREATE INDEX `qms_demo_queue_idx` ON `qms_demo_tickets` (`status`,`service_code`,`priority`,`queue_entered_at`);--> statement-breakpoint
ALTER TABLE `qms_demo_staff` ADD `assigned_counter` text;--> statement-breakpoint
UPDATE `qms_demo_staff`
SET `assigned_counter` = CASE `username`
  WHEN 'teller.one' THEN 'Counter 1'
  WHEN 'teller.two' THEN 'Counter 2'
  WHEN 'teller.three' THEN 'Counter 3'
  WHEN 'teller.four' THEN 'Counter 4'
  ELSE NULL
END
WHERE `role` = 'TELLER';--> statement-breakpoint
CREATE UNIQUE INDEX `qms_demo_staff_counter_unique` ON `qms_demo_staff` (`assigned_counter`);

