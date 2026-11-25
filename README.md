# Photo Studio — Liquid Glass

Browser photo editor. UI is built from the real `@zakisheriff/liquid-glass` components (unmodified `lg-core.mjs` + `lg.css`),
loaded through an import-map + UMD React shim, so there is **no build step**.

Run (ES modules need http, not file://):

    python3 -m http.server 8080      # or: npx serve .

Deploy as a static site (Vercel / Netlify / GitHub Pages) — no config needed.

Files: `index.html` page · `app.mjs` UI (GlassButton/Card/Input/Menu/Segmented/Sheet/Slider/Switch) · `engine.mjs` canvas engine ·
`style.css` page chrome (reads `--lg-*` tokens) · `lg-core.mjs`/`lg.css` library · `shims/` React ESM shims · `vendor/` React 18.3.1 UMD.

## v2
Tilt-shift, glow, duotone, glitch RGB-split, borders, 5 new looks, draggable before/after split, pinch-zoom + two-finger pan,
phone layout (bottom tab bar, collapsible tool panel), lighter preview resolution on touch devices.
