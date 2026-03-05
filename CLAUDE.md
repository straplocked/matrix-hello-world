# Matrix Hello - Claude Context

## Project Overview
Interactive Matrix-themed web visualization with CRT TV aesthetic. Vanilla JS + Three.js + CSS, served via Docker/nginx.

## Quick Start
- **Production**: Port 3001 via Docker (`sg docker -c "docker compose up -d --build"`)
- **Preview**: Port 3099 via python3 http.server (WebGL unavailable in preview — use port 3001 for full testing)
- **Cache busting**: Update `?v=` query strings in `index.html` when changing CSS/JS

## Key Files
- `src/main.js` (3193 lines) — All application logic: rain, waves, particles, shatter, boot, LED, easter egg, HUD, geo-trace
- `src/style.css` (457 lines) — CRT effects, animations, responsive layout
- `src/index.html` (66 lines) — Page structure, parallax layers, CRT frame

## Documentation
- Read `DOC_UPDATE.md` first for documentation strategy
- Read `docs/TABLE_OF_CONTENTS.md` for project structure overview
- Detailed docs: `docs/TECHNICAL.md`, `docs/USER_GUIDE.md`, `docs/EXECUTIVE_SUMMARY.md`
- Log changes to `docs/CHANGELOG.md` (not DOC_UPDATE.md)
- When running documentation updates, increment the count in `DOC_UPDATE.md`

## Architecture
- Rendering: 2D canvas → Three.js CanvasTexture → WebGL orthographic scene (rain + FX additive blend)
- Wave physics: 2D wave equation, triple-buffered, Phong-shaded surface
- CRT: All CSS (scanlines, vignette, phosphor dots, boot animation, frame with box-shadow bevel)
- Parallax: 4-layer Parallax.js + CSS perspective tilt from mouse/gyroscope

## Deployment
```bash
sg docker -c "docker compose -f /home/straplocked/prod/matrix-hello/docker-compose.yml up -d --build"
```
Container: non-root nginx, read-only filesystem, all caps dropped, 256MB/1CPU limit.

## Conventions
- Cache buster format: `?v=YYYYMMDD[letter]` (increment letter for same-day changes)
- No npm, no build step — CDN dependencies only (Three.js r128, Parallax.js 3.1.0, Mapbox GL JS 3.11.0)
- ES5 style JavaScript (var, function expressions, no arrow functions)
- All animation code lives in the single IIFE in main.js
