-- Draft & Publish phase 1: snapshot plumbing.
-- Adds the page_checkpoints / layout_checkpoints tables, the
-- live_published_checkpoint_id pointer + content_updated_at timestamp on
-- pages and layouts, and backfills one auto-publish checkpoint per existing
-- page and layout so source: 'live' has something to read.

CREATE TABLE `layout_checkpoints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`layout_id` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`snapshot` text NOT NULL,
	`schema_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	FOREIGN KEY (`layout_id`) REFERENCES `layouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `layout_checkpoints_layout_created_idx` ON `layout_checkpoints` (`layout_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `page_checkpoints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`snapshot` text NOT NULL,
	`schema_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `page_checkpoints_page_created_idx` ON `page_checkpoints` (`page_id`,`created_at`);--> statement-breakpoint
-- SQLite ALTER TABLE can't add a NOT NULL column without a default, and we
-- can't tighten the constraint later either. Drizzle's TS schema marks both
-- columns notNull(); the application code is the trust boundary.
ALTER TABLE `layouts` ADD `live_published_checkpoint_id` integer;--> statement-breakpoint
ALTER TABLE `layouts` ADD `content_updated_at` integer;--> statement-breakpoint
ALTER TABLE `pages` ADD `live_published_checkpoint_id` integer;--> statement-breakpoint
ALTER TABLE `pages` ADD `content_updated_at` integer;--> statement-breakpoint
UPDATE `pages` SET `content_updated_at` = `updated_at` WHERE `content_updated_at` IS NULL;--> statement-breakpoint
UPDATE `layouts` SET `content_updated_at` = `updated_at` WHERE `content_updated_at` IS NULL;--> statement-breakpoint
-- Seed one auto-publish checkpoint per page. Snapshot stores the raw page
-- row, raw blocks (no _itemId markers — the reader re-injects them), and the
-- block-scoped repeatable items, all in canonical positional order. File
-- references are by id only; the reader resolves them against live `files`
-- exactly like draft mode.
INSERT INTO `page_checkpoints` (`page_id`, `kind`, `label`, `snapshot`, `schema_version`, `created_at`, `created_by`)
SELECT
  p.id,
  'auto-publish',
  NULL,
  json_object(
    'page', json_object(
      'id', p.id,
      'projectId', p.project_id,
      'environmentId', p.environment_id,
      'pathSegment', p.path_segment,
      'fullPath', p.full_path,
      'parentPageId', p.parent_page_id,
      'layoutId', p.layout_id,
      'metaTitle', p.meta_title,
      'metaDescription', p.meta_description,
      'aiSeoEnabled', p.ai_seo_enabled,
      'customOgImageBlobId', p.custom_og_image_blob_id,
      'customOgImageUrl', p.custom_og_image_url,
      'createdAt', p.created_at,
      'updatedAt', p.updated_at
    ),
    'blocks', coalesce(
      (SELECT json_group_array(json_object(
        'id', b.id,
        'pageId', b.page_id,
        'layoutId', b.layout_id,
        'type', b.type,
        'content', json(b.content),
        'settings', CASE WHEN b.settings IS NULL THEN NULL ELSE json(b.settings) END,
        'placement', b.placement,
        'summary', b.summary,
        'position', b.position,
        'createdAt', b.created_at,
        'updatedAt', b.updated_at
      )) FROM (SELECT * FROM `blocks` WHERE page_id = p.id ORDER BY position) b),
      json('[]')
    ),
    'repeatableItems', coalesce(
      (SELECT json_group_array(json_object(
        'id', ri.id,
        'blockId', ri.block_id,
        'parentItemId', ri.parent_item_id,
        'fieldName', ri.field_name,
        'content', json(ri.content),
        'settings', CASE WHEN ri.settings IS NULL THEN NULL ELSE json(ri.settings) END,
        'summary', ri.summary,
        'position', ri.position,
        'createdAt', ri.created_at,
        'updatedAt', ri.updated_at
      )) FROM (
        SELECT ri.* FROM `repeatable_items` ri
        INNER JOIN `blocks` b ON ri.block_id = b.id
        WHERE b.page_id = p.id
        ORDER BY ri.position
      ) ri),
      json('[]')
    )
  ),
  1,
  p.updated_at,
  NULL
FROM `pages` p
WHERE p.live_published_checkpoint_id IS NULL;--> statement-breakpoint
UPDATE `pages` SET `live_published_checkpoint_id` = (
  SELECT pc.id FROM `page_checkpoints` pc WHERE pc.page_id = `pages`.id ORDER BY pc.id DESC LIMIT 1
) WHERE `live_published_checkpoint_id` IS NULL;--> statement-breakpoint
INSERT INTO `layout_checkpoints` (`layout_id`, `kind`, `label`, `snapshot`, `schema_version`, `created_at`, `created_by`)
SELECT
  l.id,
  'auto-publish',
  NULL,
  json_object(
    'layout', json_object(
      'id', l.id,
      'projectId', l.project_id,
      'environmentId', l.environment_id,
      'layoutId', l.layout_id,
      'description', l.description,
      'createdAt', l.created_at,
      'updatedAt', l.updated_at
    ),
    'blocks', coalesce(
      (SELECT json_group_array(json_object(
        'id', b.id,
        'pageId', b.page_id,
        'layoutId', b.layout_id,
        'type', b.type,
        'content', json(b.content),
        'settings', CASE WHEN b.settings IS NULL THEN NULL ELSE json(b.settings) END,
        'placement', b.placement,
        'summary', b.summary,
        'position', b.position,
        'createdAt', b.created_at,
        'updatedAt', b.updated_at
      )) FROM (SELECT * FROM `blocks` WHERE layout_id = l.id ORDER BY position) b),
      json('[]')
    ),
    'repeatableItems', coalesce(
      (SELECT json_group_array(json_object(
        'id', ri.id,
        'blockId', ri.block_id,
        'parentItemId', ri.parent_item_id,
        'fieldName', ri.field_name,
        'content', json(ri.content),
        'settings', CASE WHEN ri.settings IS NULL THEN NULL ELSE json(ri.settings) END,
        'summary', ri.summary,
        'position', ri.position,
        'createdAt', ri.created_at,
        'updatedAt', ri.updated_at
      )) FROM (
        SELECT ri.* FROM `repeatable_items` ri
        INNER JOIN `blocks` b ON ri.block_id = b.id
        WHERE b.layout_id = l.id
        ORDER BY ri.position
      ) ri),
      json('[]')
    )
  ),
  1,
  l.updated_at,
  NULL
FROM `layouts` l
WHERE l.live_published_checkpoint_id IS NULL;--> statement-breakpoint
UPDATE `layouts` SET `live_published_checkpoint_id` = (
  SELECT lc.id FROM `layout_checkpoints` lc WHERE lc.layout_id = `layouts`.id ORDER BY lc.id DESC LIMIT 1
) WHERE `live_published_checkpoint_id` IS NULL;
