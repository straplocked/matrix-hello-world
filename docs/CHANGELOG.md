# Changelog

All notable changes to this project are documented here.

---

## 2026-03-05 — Red Dot Easter Egg & Geo-Trace Scanner

### Features — Red Dot Easter Egg
- Added hidden red dot that appears ~20s after boot sequence completes
- Dot pulses with subtle glow animation, positioned randomly along screen edge
- Clicking the dot triggers a full-screen geo-trace surveillance sequence

### Features — Geo-Trace Scanner Sequence
- **Mapbox GL JS v3.11.0** integration — real satellite map tiles with terrain
- Frame-by-frame map control via `map.jumpTo()` — scanner reticle drives map position
- Multi-phase search timeline with false lock-ons:
  - SCANNING → ACQUIRING → SIGNAL LOST → REACQUIRING → ACQUIRING → SIGNAL LOST → CONVERGING → LOCKED
- Wide error margins on false positions (~0.3°/0.4° offset — nearly another town)
- Zoom progression from continent-level (zoom 4) to street-level (zoom 18)
- Zoom pullback during SIGNAL LOST phases for dramatic "losing confidence" effect
- Pre-generated waypoints eliminate per-frame randomness flicker
- ipinfo.io client-side geo-IP fetch for viewer's real lat/lng coordinates

### Features — Surveillance HUD
- Full canvas HUD overlay with targeting reticle (centered, ±2px breathing jitter)
- Status bar showing search state with color coding (green/yellow/red)
- Callout panel with leader line, typewriter text, coordinate readout
- Scanning crosshair with rotating sweep indicator
- Grid overlay, corner brackets, coordinate displays

### Features — Error Notifications
- Shared `drawSignalLostOverlay()` for both Mapbox and fallback paths
- Red screen flash with horizontal static noise bands
- 64px warning bar with bold 22px text: `!! WARNING: SIGNAL INTERRUPTED !!`
- Typewriter error codes, 14px status text, flashing ⚠ icons
- Extended SIGNAL LOST phases (12% of timeline each) for readable display
- 6px reticle jitter during error phases vs 2px normal

### Features — Post-Lock Sequence
- Ground-break shatter effect on locked satellite view
- Glitch corruption overlay with CRT shutdown
- Full system reboot (CRT boot sequence replays)

### Visual
- Fallback path (no Mapbox) with seeded-random procedural map generation
- Matching search timeline, HUD, and error overlays for fallback
- Surveillance display integrates viewer's real geo data (IP, city, ISP)

### Technical
- `getSearchGeo(t)` — per-frame geographic interpolation across 8-phase timeline
- `getSearchState(t)` — state machine matching geographic phases
- Completion via draw-loop `t >= 1.0` (not `moveend` events)
- Pre-generated `jerkBearing1`/`jerkBearing2` for stable SIGNAL LOST animation
- Shared `drawSurveillanceHud()` for callout panel rendering
- CSP updated: `connect-src` allows `https://api.mapbox.com`, `https://events.mapbox.com`
- Current cache buster: `?v=20260305s`
- main.js: 3,193 lines (up from 1,011)

---

## 2026-03-04 — Content & Typography Refinements

### Features
- Added 20 system error messages to glitch sequences — random error flashes in red (e.g., "SYSTEM APPROXIMATING", "CANNOT LOCK TRACK", "BUFFER OVERFLOW DETECTED") appear between corruption and data reveal
- Expanded typewriter MESSAGES array from 6 to 20 entries with Matrix-themed quotes ("welcome to the desert of the real", "choice is an illusion", etc.)

### Visual
- Reduced parallax text layer intensity (data-depth 0.60 → 0.20) for subtler floating effect
- Shrunk WAKE UP font size (clamp 3/10vw/8rem → 2.5/8vw/6rem)
- Tightened WAKE UP line-height (1.1 → 0.85)
- Restored font-weight to bold after iterating through 300/400/500/600

### Technical
- Current cache buster: `?v=20260304y`

---

## 2026-03-04 — Surveillance & Ambient Effects

### Features
- Added surveillance display — cycles viewer's real info (IP, location, ISP, browser, OS, GPU, screen, timezone) via ipinfo.io public API
- Added glitch/error animation on unstable surveillance lines (CPU, RAM, GPU, NETWORK) — signal unstable flash, character corruption, color spasms, blackout flickers, horizontal jitter
- Added ambient water movement — random wave drops + organic sine-wave swell across entire background surface
- Doubled ripple size (waveDropRadius 24→48), increased strength (30→40) and persistence (damping 0.985→0.988)

### Security
- Removed nginx `/api/whoami` endpoint that leaked Docker bridge IP (172.18.0.1)
- Switched to client-side ipinfo.io API — viewer's browser makes the request directly
- Updated CSP `connect-src` to allow `https://ipinfo.io`
- Graceful fallback if ipinfo.io blocked by ad blockers

### Technical
- Current cache buster: `?v=20260304r`
- Wave activity skip optimization removed — ambient movement always applies
- Surveillance data built from browser fingerprint APIs + ipinfo.io geo-IP

---

## 2026-03-04 — Open Source Release Prep

### Open Source
- Created `README.md` with badges, feature list, quick start, tech stack, project structure
- Created `CONTRIBUTING.md` with code style guidelines and contribution rules
- Created `LICENSE` (MIT)
- Sanitized `docker-compose.yml` — replaced local network IP bind with `0.0.0.0`
- Sanitized documentation — replaced all local IP references with `localhost`
- Verified no sensitive paths, credentials, or personal data in tracked files

---

## 2026-03-04 — Documentation Update #1

### Documentation
- Created `DOC_UPDATE.md` — documentation update plan and strategy
- Created `docs/TABLE_OF_CONTENTS.md` — master index and project file map
- Created `docs/TECHNICAL.md` — full architecture, rendering pipeline, animation systems, security model, deployment guide
- Created `docs/USER_GUIDE.md` — end-user interactions, visual effects, browser requirements
- Created `docs/EXECUTIVE_SUMMARY.md` — leadership overview, tech stack, deployment status, codebase metrics
- Created `docs/CHANGELOG.md` — this file
- Created `CLAUDE.md` — AI assistant project context file

### Project Changes (pre-documentation)
- Added CRT boot sequence with 7-phase power-on animation contained inside bezel
- Added physics-based text shatter effect on [WAKE UP] text with Matrix decode reassembly
- Added random LED power indicator flickering
- Added blinking typewriter cursor (replaced standalone cursor div)
- Removed overlay background gradient for cleaner look
- Slowed matrix rain by 50% (speed 0.3 → 0.15) without affecting other animations
- Fixed shatter letter size — removed scale factor so characters maintain original size during explosion
- Fixed shatter opacity — characters now fully fade to 0 (multiplier 0.85 → 1.35)
- Added mobile viewport overflow fix (position: fixed on body)
- Current cache buster: `?v=20260304m`

### Infrastructure
- Container runs as non-root nginx user with hardened security settings
- Read-only filesystem, all capabilities dropped, resource-limited
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options, XSS-Protection
