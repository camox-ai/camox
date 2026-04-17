PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_repeatable_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` integer NOT NULL,
	`parent_item_id` integer,
	`field_name` text NOT NULL,
	`content` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`position` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_item_id`) REFERENCES `repeatable_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_repeatable_items`("id", "block_id", "parent_item_id", "field_name", "content", "summary", "position", "created_at", "updated_at") SELECT "id", "block_id", "parent_item_id", "field_name", "content", "summary", "position", "created_at", "updated_at" FROM `repeatable_items`;--> statement-breakpoint
DROP TABLE `repeatable_items`;--> statement-breakpoint
ALTER TABLE `__new_repeatable_items` RENAME TO `repeatable_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `repeatable_items_block_field_idx` ON `repeatable_items` (`block_id`,`field_name`);--> statement-breakpoint
CREATE INDEX `repeatable_items_block_idx` ON `repeatable_items` (`block_id`);--> statement-breakpoint
CREATE INDEX `repeatable_items_parent_idx` ON `repeatable_items` (`parent_item_id`);