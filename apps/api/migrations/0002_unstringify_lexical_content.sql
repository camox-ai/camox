-- Un-stringify Lexical JSON values in blocks.content
-- Lexical field values were stored as JSON-in-JSON strings (e.g. "{\"root\":...}").
-- This migration converts them to nested JSON objects (e.g. {"root":...}).
UPDATE blocks
SET content = (
  SELECT json_group_object(
    je.key,
    CASE
      WHEN je.type = 'text' AND je.value LIKE '{"root":%' THEN json(je.value)
      WHEN je.type IN ('object', 'array') THEN json(je.value)
      WHEN je.type = 'true' THEN json('true')
      WHEN je.type = 'false' THEN json('false')
      WHEN je.type = 'null' THEN json('null')
      ELSE je.value
    END
  )
  FROM json_each(blocks.content) AS je
)
WHERE EXISTS (
  SELECT 1 FROM json_each(blocks.content)
  WHERE type = 'text' AND value LIKE '{"root":%'
);

-- Un-stringify Lexical JSON values in repeatable_items.content
UPDATE repeatable_items
SET content = (
  SELECT json_group_object(
    je.key,
    CASE
      WHEN je.type = 'text' AND je.value LIKE '{"root":%' THEN json(je.value)
      WHEN je.type IN ('object', 'array') THEN json(je.value)
      WHEN je.type = 'true' THEN json('true')
      WHEN je.type = 'false' THEN json('false')
      WHEN je.type = 'null' THEN json('null')
      ELSE je.value
    END
  )
  FROM json_each(repeatable_items.content) AS je
)
WHERE EXISTS (
  SELECT 1 FROM json_each(repeatable_items.content)
  WHERE type = 'text' AND value LIKE '{"root":%'
);
