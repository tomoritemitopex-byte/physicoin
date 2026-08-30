# Health — Forest Build

- **Images optimized**: `public/ref1.jpg` (120k) → `ref1.webp` 56k, `ref2.jpg` 103k → `ref2.webp` 48k via Pillow WebP q72. `public/manifest.json` now prefers `image/webp` (jpg retained as fallback). `public/sw.js` SHELL_URLS updated to `.webp`. `next.config.mjs` sets `images.formats: ["image/webp","image/avif"]` + `optimizePackageImports: ["lucide-react"]` for smaller bundles. Recommend using `next/image` with `priority` for above-fold hero peek where these refs are displayed.
- **Roadmap code split**: `app/app/roadmap/page.tsx` uses `next/dynamic` with `ssr:false` for `RepExplainer`, `RepBoard`, `ShareCard` — keeps initial roadmap chunk 30.6kB from bloating; verify via `next build` chunks (dynamic = separate `*.js`).
- **Cleanup — disk 98% (138M free on /home)**: Run periodically:
  ```
  rm -rf /home/tomoritemitopex/.cache/* /tmp/next-*  # next build cache
  npm prune && npm cache clean --force
  # keep .webp, remove original jpg only if fallback not needed: rm public/ref1.jpg public/ref2.jpg (saves ~220k, keep for now)
  df -h | grep /home
  ```
  Keep forest palette `#0d3b2a→#1a5c3a`, purple road `#8b5cf6`, Fredoka — unchanged.
