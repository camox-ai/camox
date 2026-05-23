# Camox

Camox is an agentic page builder framework for defining website structure in code while editing content visually or through agents.

## Language

**Project**:
A Camox workspace for one website or app, owned by an organization and identified by a slug.
_Avoid_: Site, workspace, app

**Environment**:
A project-specific content space such as production or a developer-specific development environment. A **Project** has one or more **Environments**.
_Avoid_: Stage, branch

**SDK**:
The developer-facing Camox package published to npm as `camox`. It provides the APIs and runtime used to define blocks, layouts, and Camox-powered sites in code.
_Avoid_: Library, framework package

**Camox Studio**:
The Camox editing UI for visually managing pages, blocks, content, metadata, assets, and publishing workflows.
_Avoid_: Admin, dashboard, editor

**Agent Chat**:
A Camox Studio surface where a user describes desired page, layout, or content changes and an agent uses Camox tools to inspect and modify the current Project Environment.
_Avoid_: AI editor, in-app interface

**Dashboard**:
The Camox web app for account-level and project-level workflows outside the in-site editing experience.
_Avoid_: Studio, editor

**Page**:
A routable website document with a full path, optional parent page, metadata, a selected **Layout**, and ordered **Blocks**.
_Avoid_: Route, screen, view

**Layout**:
A reusable page wrapper that provides shared structure and metadata for **Pages**, such as navigation and footer regions.
_Avoid_: Template, shell

**Block Definition**:
The reusable, code-defined description of a block type, including its title, description, content shape, settings shape, defaults, and whether it is layout-only.
_Avoid_: Component schema, block schema

**Block**:
An instance of a **Block Definition** placed on a **Page** or **Layout**, with editable content and settings.
_Avoid_: Section, component, module

**Repeatable Item**:
An ordered item inside a repeatable block field. A **Repeatable Item** belongs to a **Block** and may be nested under another repeatable item.
_Avoid_: List item, child block

**Content**:
The user-editable data that determines what a **Block** or **Repeatable Item** says or shows.
_Avoid_: Props, data

**Settings**:
Configuration that changes how a **Block** or **Repeatable Item** behaves or appears without being the primary content.
_Avoid_: Options, config

**Checkpoint**:
A captured version of a **Page** or **Layout** used to serve or inspect a stable content state.
_Avoid_: Snapshot, version

**Draft Source**:
The editable source of truth for unpublished content.
_Avoid_: Preview state

**Live Source**:
The published source of truth served to public page reads.
_Avoid_: Production state

## Example Dialogue

Developer: "Should this navigation live on every page?"
Domain expert: "Yes, define it as a Block in the Layout so Pages using that Layout inherit it."

Developer: "The hero copy is different on the homepage."
Domain expert: "That belongs in the Page's Block content, not in the Block Definition."

Developer: "Can we publish this Page without changing the shared footer?"
Domain expert: "Yes, publish the Page's Live Source from its current draft without publishing the Layout."
