# Changelog

All notable changes to this project are documented here.

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
