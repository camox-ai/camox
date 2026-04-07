DROP INDEX IF EXISTS projects_domain_idx;
--> statement-breakpoint
ALTER TABLE projects DROP COLUMN domain;
