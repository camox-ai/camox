ALTER TABLE `repeatable_items` ADD `parent_item_id` integer;--> statement-breakpoint
CREATE INDEX `repeatable_items_parent_idx` ON `repeatable_items` (`parent_item_id`);
