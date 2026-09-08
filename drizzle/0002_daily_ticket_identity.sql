DROP INDEX `qms_demo_tickets_public_number_unique`;--> statement-breakpoint
ALTER TABLE `qms_demo_tickets` ADD `business_date` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `qms_demo_tickets`
SET `business_date` = strftime('%Y-%m-%d', datetime(`created_at`, '+3 hours'))
WHERE `business_date` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `qms_demo_ticket_number_per_day_unique` ON `qms_demo_tickets` (`business_date`,`public_number`);

