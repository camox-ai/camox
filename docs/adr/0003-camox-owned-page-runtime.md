# Camox-Owned Page Runtime

Camox will stop building Camox apps on top of TanStack Start and TanStack Router.

Why:

- Clearer value proposition: users build Camox apps, not TanStack Start apps with Camox added on top.
- Easier to define Camox: Camox is a fullstack framework, not a toolkit, meta-framework layer, or "meta-meta-framework".
- Simpler Project surface: users should mainly see Blocks, Layouts, components, and styles.
- Less fragile maintenance: Camox no longer needs to generate and maintain large route files as template strings.
- Cleaner routing ownership: non-Camox routes sharing the same router as Camox Pages caused issues.

This does not mean dropping TanStack entirely. TanStack Query remains useful for data caching and hydration. The problem is specifically TanStack Start/Router owning the visible app architecture and routing boundary for Camox Projects.
