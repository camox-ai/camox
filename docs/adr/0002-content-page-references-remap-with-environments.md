# Content Page References Remap with Environments

Content may contain references to **Pages**, including standalone link fields and embedded text links in string content. These references use page identifiers as their durable target so they survive path changes, and they are remapped when duplicating an **Environment** so copied content points at the copied Pages instead of the source Environment's Pages.

If a content page reference cannot be resolved, rendering falls back to an inert current-page target while preserving the original page reference in stored content. Camox Studio should show the unresolved reference instead of silently converting it to an external URL.

Embedded text links in string content do not store per-link tab behavior. Page text links open in the same tab, while URL text links are limited to `http` and `https` targets and open in a new tab. Other markdown link targets are not treated as valid text links.

Text links use Lexical's standard link node and encode Page destinations as markdown links whose target is `camox:page:{pageId}`. This keeps the persisted value markdown-native and lets the editors rely on Lexical's link plugin instead of a custom node type.

Markdown APIs expose Page text links with their stable `camox:page:{pageId}` target rather than resolving them to the current Page path. Consumers that render the content are responsible for resolving the target in the relevant Project Environment.

String fields render text links automatically wherever the field content is rendered. Block authors do not opt in to a separate text-link API for `Type.String` fields.
