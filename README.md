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

## v3
- **Crop tool** with draggable handles, ratio lock, rule-of-thirds grid; fully undoable (press `C`, Enter to apply, Esc to cancel)
- **Smart crop** (saliency search), **auto white balance**, **palette extraction** + duotone-from-palette
- **AI background removal / portrait blur** — RMBG-1.4 via Transformers.js, runs in the browser (WebGPU, falls back to WASM). The model (~45 MB)
  downloads from Hugging Face on first use and is cached; needs internet once. Code is in `ai.mjs` and is only loaded when you use it.
- **Magic cutout** — instant, offline, for plain backgrounds; background fill color
- **Mosaic / blur brushes** for hiding faces and text
- **Save / open project** (`.pstudio`) with all layers
- **Performance**: rendered base is cached so moving layers and brushing never re-runs the effects; histogram is throttled
- **PWA**: installable and works offline after the first load (`sw.js`, `manifest.webmanifest`)
