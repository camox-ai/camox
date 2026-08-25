---
name: camox
description: Use when working in a Camox codebase with Block Definitions, Layout Definitions, Pages, Block content, the Camox CLI, publishing, or Environments. Applies to code-defined site structure and agent-driven content changes.
---

# Camox

Load only the references needed for the current task. Do not preload every reference.

- To create or change a **Block Definition** in `src/blocks/`, read [references/block-definitions.md](references/block-definitions.md).
- To create or change a **Layout Definition** in `src/layouts/`, read [references/layout-definitions.md](references/layout-definitions.md).
- For any CLI operation, first read [references/cli-common.md](references/cli-common.md), then read only the relevant command reference:
  - To inspect, create, edit, move, or delete Block instances or their Content, read [references/cli-blocks.md](references/cli-blocks.md).
  - To inspect, create, update, publish, or assign Layouts to Pages, read [references/cli-pages.md](references/cli-pages.md).
  - To target production or replicate content between Environments, read [references/cli-environments.md](references/cli-environments.md).

A request can cross boundaries. For example, adding a new kind of section to a Page may require the Block Definition reference followed by the CLI common and Block references. Load the additional reference only once that need is established.
