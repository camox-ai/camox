<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./art/logo-banner-dark.webp" />
    <source media="(prefers-color-scheme: light)" srcset="./art/logo-banner-light.webp" />
    <img src="./art/logo-banner-light.webp" alt="Camox logo" />
  </picture>
</p>

## The CMS framework for the AI era

Camox is a web framework built on Vite, with a CMS at its heart.

Instead of letting you create routes, you define blocks, which are reusable sections of pages. Camox then uses this catalog of blocks, letting them compose them together to build your pages. This can be done:

- via visual editing: open your site, authenticate, and manage everything directly in the UI.
- via CLI: all content management actions can be taken via the command line.

Your app comes with skills that teach coding agents how to write blocks and use the CLI. All APIs are (very) type safe, and built around standard schema for validation. So your coding agent knows exactly how to manage your Camox site, out of the box, and will solve its own mistakes.

- [Website](https://camox.ai)
- [Video product overview](https://youtu.be/sftAaNrrfR8)
- [GitHub](https://github.com/remidej/camox)

## Quick start

```bash
npm create camox@latest
```

## How it works

1. Create a Camox project via CLI
2. Define "blocks" in code (reusable sections of UI, with a schema and a component)
3. Edit content visually within your website
4. Let your coding agent suggest drafts of pages and changes
5. Publish your pages and get a production-ready website

## Features

- Full visual editing
- Automatic SEO management
- Draft and publish workflow
- Automatic asset optimization
- OpenGraph image generation
- Native markdown generation for agents

## License

The Camox framework is MIT-licensed: `camox`, `@camox/cli`, `create-camox`,
`@camox/ui`, `@camox/api-contract`, templates, and supporting packages. The
hosted API implementation in `apps/api` is source-available under [FSL-1.1-MIT](https://fsl.software/).
