ALTER TABLE `pages` ADD `created_by_id` text REFERENCES user(id);
