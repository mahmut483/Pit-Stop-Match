# Pit Stop Match

A 3D playable ad for a tidy-up puzzle set in an auto repair shop. Rotate the room, tap the items and collect three of the same part to clear the tray.

**Play it:** https://pit-stop-match.vercel.app

## Tech

- [three.js](https://threejs.org) for rendering
- [Rapier](https://rapier.rs) (`@dimforge/rapier3d-compat`) for physics
- [esbuild](https://esbuild.github.io) bundles everything into a single, self-contained HTML file, as ad networks expect from a playable ad (no external requests)

## Build

```bash
npm install
npm run build        # dist/Tidy-Up-Sanayi.html (single file) and deploy/ (web build)
node build.mjs --dev # unminified build
```

## Project layout

- `src/`: game code (`main.js`, room, items, physics, effects, levels) and icons
- `tools/`: development helpers (icon export, item catalog, mobile touch test, screenshot and play scripts using headless Chrome)
