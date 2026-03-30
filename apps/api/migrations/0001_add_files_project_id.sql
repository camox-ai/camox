ALTER TABLE `files` ADD COLUMN `project_id` integer REFERENCES `projects`(`id`);--> statement-breakpoint
CREATE INDEX `files_project_idx` ON `files` (`project_id`);