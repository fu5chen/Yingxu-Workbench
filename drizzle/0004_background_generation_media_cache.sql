CREATE TABLE `generation_queue` (
	`job_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`provider` text NOT NULL,
	`sealed_key` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`next_poll` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_generation_queue_state` ON `generation_queue` (`state`,`created`);--> statement-breakpoint
CREATE TABLE `media_cache` (
	`job_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`error` text
);
