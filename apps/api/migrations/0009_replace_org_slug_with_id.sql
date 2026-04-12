-- Add organization_id column (no FK constraint — SQLite doesn't support adding REFERENCES with DEFAULT)
ALTER TABLE `projects` ADD `organization_id` text NOT NULL DEFAULT '';--> statement-breakpoint

-- Backfill organization_id from organization_slug
UPDATE `projects` SET `organization_id` = (
  SELECT `id` FROM `organization` WHERE `organization`.`slug` = `projects`.`organization_slug`
);--> statement-breakpoint

-- Drop old column and index
DROP INDEX IF EXISTS `projects_organization_idx`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `organization_slug`;--> statement-breakpoint

-- Recreate index on organization_id
CREATE INDEX `projects_organization_idx` ON `projects` (`organization_id`);
