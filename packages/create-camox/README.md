# create-camox

Scaffolds a new [Camox](https://camox.ai) project.

```bash
npm create camox
```

## Why does this package exist?

This is a thin wrapper around `@camox/cli init`. It exists so that `npm create camox` always fetches the latest version of the CLI from the registry, rather than resolving a cached or locally installed copy of the `camox` package. It also avoids downloading the full SDK and its dependencies just to run the init command.
