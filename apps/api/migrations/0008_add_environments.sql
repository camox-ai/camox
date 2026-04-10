-- Create environments table
CREATE TABLE `environments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `project_id` integer NOT NULL REFERENCES `projects`(`id`),
  `name` text NOT NULL,
  `type` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `environments_project_name_idx` ON `environments` (`project_id`, `name`);
CREATE INDEX `environments_project_idx` ON `environments` (`project_id`);

-- Add environment_id to layouts
ALTER TABLE `layouts` ADD COLUMN `environment_id` integer REFERENCES `environments`(`id`);
CREATE INDEX `layouts_environment_layout_idx` ON `layouts` (`environment_id`, `layout_id`);

-- Add environment_id to pages
ALTER TABLE `pages` ADD COLUMN `environment_id` integer REFERENCES `environments`(`id`);
CREATE INDEX `pages_environment_full_path_idx` ON `pages` (`environment_id`, `full_path`);

-- Add environment_id to block_definitions
ALTER TABLE `block_definitions` ADD COLUMN `environment_id` integer REFERENCES `environments`(`id`);
CREATE INDEX `block_definitions_environment_block_idx` ON `block_definitions` (`environment_id`, `block_id`);

-- Add environment_id to files
ALTER TABLE `files` ADD COLUMN `environment_id` integer REFERENCES `environments`(`id`);
CREATE INDEX `files_environment_idx` ON `files` (`environment_id`);
