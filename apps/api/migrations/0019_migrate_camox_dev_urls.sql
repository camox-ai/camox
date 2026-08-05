UPDATE `files`
SET `url` = replace(`url`, 'https://api.camox.ai/', 'https://api.camox.dev/')
WHERE `url` LIKE 'https://api.camox.ai/%';--> statement-breakpoint
UPDATE `pages`
SET `custom_og_image_url` = replace(
  `custom_og_image_url`,
  'https://api.camox.ai/',
  'https://api.camox.dev/'
)
WHERE `custom_og_image_url` LIKE 'https://api.camox.ai/%';--> statement-breakpoint
UPDATE `page_checkpoints`
SET `snapshot` = json_set(
  `snapshot`,
  '$.page.customOgImageUrl',
  replace(
    json_extract(`snapshot`, '$.page.customOgImageUrl'),
    'https://api.camox.ai/',
    'https://api.camox.dev/'
  )
)
WHERE json_extract(`snapshot`, '$.page.customOgImageUrl') LIKE 'https://api.camox.ai/%';
