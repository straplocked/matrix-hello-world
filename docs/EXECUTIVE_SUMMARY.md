# Matrix Hello - Executive Summary

## Overview

Matrix Hello is an interactive web-based visualization that recreates the iconic Matrix digital rain effect with a retro CRT television aesthetic. It serves as a creative technology showcase and landing page, demonstrating modern web rendering techniques in a zero-dependency, container-deployed package.

## What It Does

- Displays real-time animated Matrix-style cascading characters
- Responds to user interaction: mouse clicks create physics-based ripple effects, hovering bends the rain, and crossing the main text triggers a cinematic shatter-and-reassemble animation
- Simulates a CRT television with realistic boot sequence, scanlines, phosphor dot pattern, and screen curvature
- Creates depth through parallax layers and perspective tilt tracking
- Hidden easter egg: clicking a pulsing red dot triggers a geo-trace surveillance sequence with real satellite map tiles (Mapbox GL JS) that scans for and locks onto the viewer's location

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | Vanilla JavaScript (ES5) | Zero build tools, maximum compatibility, no framework overhead |
| 3D Rendering | Three.js (CDN) | GPU-accelerated canvas compositing via WebGL |
| Parallax | Parallax.js (CDN) | Proven library for mouse/gyroscope depth effects |
| Mapping | Mapbox GL JS (CDN) | Satellite map tiles for geo-trace easter egg |
| Server | nginx 1.27 Alpine | Minimal footprint (~7MB image), high performance |
| Container | Docker Compose | Reproducible deployment, infrastructure-as-code |
| CI/CD | Shell scripts + git hooks | Pre-commit validation, auto-rebuild on merge |

## Key Technical Decisions

- **No build step**: Source files are served directly — no webpack, no npm, no transpilation. This eliminates build complexity and makes the project trivially reproducible.
- **CDN dependencies**: Three.js and Parallax.js loaded from cdnjs. No local `node_modules`. Pinned versions for stability.
- **Hardened container**: Non-root user, read-only filesystem, all Linux capabilities dropped, resource-limited (256MB RAM, 1 CPU). Security headers include CSP, X-Frame-Options, and HSTS-ready configuration.

## Deployment Status

| Metric | Value |
|--------|-------|
| Environment | Self-hosted Docker |
| URL | `http://localhost:3001` |
| Container | `matrix-hello` (nginx:1.27-alpine) |
| Uptime | Managed via `restart: unless-stopped` |
| Healthcheck | wget-based, 30s interval |
| Resource Budget | 256MB RAM, 1 CPU core |

## Codebase Size

| File | Lines | Purpose |
|------|-------|---------|
| `main.js` | 3,193 | All application logic (rain, waves, shatter, easter egg, HUD) |
| `style.css` | 457 | All visual styling and CRT effects |
| `index.html` | 66 | Page structure |
| **Total** | **3,716** | Complete application |

Plus ~100 lines of infrastructure (Dockerfile, compose, nginx conf, Makefile, scripts).

## Security Posture

- Container runs as non-root with zero Linux capabilities
- Read-only filesystem prevents runtime modification
- Content Security Policy restricts script/style sources
- Client-side only API calls (ipinfo.io geo-IP, Mapbox tiles) — no server-side data collection
- No cookies, no user authentication required
