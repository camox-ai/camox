<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./art/logo-banner-dark.webp" />
    <source media="(prefers-color-scheme: light)" srcset="./art/logo-banner-light.webp" />
    <img src="./art/logo-banner-light.webp" alt="Camox logo" />
  </picture>
</p>

## The open-source CMS for coding agents

Camox is an open-source page builder framework. It lets developers build quality websites fast by using tools like Claude Code while getting the best parts of a CMS (visual editing, drafts...)

- [Website](https://camox.ai)
- [Video product overview](https://youtu.be/sftAaNrrfR8)
- [GitHub](https://github.com/camox-ai/camox)

The repository includes the public Camox site in `apps/landing` and the account
and Project Dashboard in `apps/dashboard`.

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
