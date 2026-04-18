PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer,
	`layout_id` integer,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`settings` text,
	`placement` text,
	`summary` text DEFAULT '' NOT NULL,
	`position` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`layout_id`) REFERENCES `layouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_blocks`("id", "page_id", "layout_id", "type", "content", "settings", "placement", "summary", "position", "created_at", "updated_at") SELECT "id", "page_id", "layout_id", "type", "content", "settings", "placement", "summary", "position", "created_at", "updated_at" FROM `blocks`;--> statement-breakpoint
DROP TABLE `blocks`;--> statement-breakpoint
ALTER TABLE `__new_blocks` RENAME TO `blocks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `blocks_page_idx` ON `blocks` (`page_id`);--> statement-breakpoint
CREATE INDEX `blocks_layout_idx` ON `blocks` (`layout_id`);--> statement-breakpoint
CREATE INDEX `blocks_type_idx` ON `blocks` (`type`);