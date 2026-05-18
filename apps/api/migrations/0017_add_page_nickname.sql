ALTER TABLE `pages` ADD `nickname` text;--> statement-breakpoint
WITH RECURSIVE
  page_labels(id, source) AS (
    SELECT
      id,
      CASE
        WHEN full_path = '/' THEN 'Home'
        ELSE replace(replace(path_segment, '-', ' '), '_', ' ')
      END
    FROM `pages`
  ),
  chars(id, source, pos, label) AS (
    SELECT id, source, 1, '' FROM page_labels
    UNION ALL
    SELECT
      id,
      source,
      pos + 1,
      label || CASE
        WHEN pos = 1 OR substr(source, pos - 1, 1) = ' ' THEN upper(substr(source, pos, 1))
        ELSE substr(source, pos, 1)
      END
    FROM chars
    WHERE pos <= length(source)
  )
UPDATE `pages`
SET `nickname` = substr(
  coalesce(
    nullif(trim(`meta_title`), ''),
    (
      SELECT label
      FROM chars
      WHERE chars.id = `pages`.id
        AND chars.pos = length(chars.source) + 1
    )
  ),
  1,
  80
);--> statement-breakpoint
UPDATE `pages`
SET `nickname` = 'Untitled page'
WHERE `nickname` IS NULL OR trim(`nickname`) = '';--> statement-breakpoint
UPDATE `page_checkpoints`
SET
  `snapshot` = json_set(
    `snapshot`,
    '$.page.nickname',
    (
      SELECT `nickname`
      FROM `pages`
      WHERE `pages`.`id` = `page_checkpoints`.`page_id`
    )
  ),
  `schema_version` = 2
WHERE json_extract(`snapshot`, '$.page.nickname') IS NULL;
