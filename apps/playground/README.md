Development playground for trying out all Camox APIs. This app is not meant to be deployed — it exists to test and experiment with blocks, layouts, and other Camox features during development.

The playground uses the Camox-owned Nitro runtime. Its authored application surface is:

```txt
src/
  blocks/
  layouts/
  components/
  document.ts
  styles.css
```

Camox owns page routing, SSR, hydration, client navigation, Studio, sitemap, markdown, and OG responses. The app does not define TanStack Start or TanStack Router entries.
