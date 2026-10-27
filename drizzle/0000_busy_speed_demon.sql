CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`url` text NOT NULL,
	`expires` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_assets_owner_created` ON `assets` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`upstream` text,
	`status` text NOT NULL,
	`request` text NOT NULL,
	`result` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_owner_created` ON `jobs` (`owner`,`created`);