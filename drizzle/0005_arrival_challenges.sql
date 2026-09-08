CREATE TABLE `qms_arrival_challenges` (
	`branch_code` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL
);
