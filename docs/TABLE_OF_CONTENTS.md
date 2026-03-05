# Matrix Hello - Documentation Index

## Project Summary
**matrix-hello** is an interactive Matrix-themed web visualization featuring real-time digital rain, a CRT TV aesthetic with boot animation, parallax depth, physics-based wave ripples, and a text shatter effect. Built with vanilla JavaScript, Three.js, and CSS — served via Docker/nginx.

## Quick Reference
- **Port**: 3001 (production), 3099 (preview/dev)
- **Stack**: Vanilla JS, Three.js r128, Parallax.js 3.1.0, nginx 1.27-alpine
- **Container**: `matrix-hello` via Docker Compose
- **Entry Point**: `src/index.html`

## Documentation Files

| # | Document | Audience | Contents |
|---|----------|----------|----------|
| 1 | [Technical Documentation](TECHNICAL.md) | Developers | Architecture, rendering pipeline, animation systems, security model, deployment |
| 2 | [User Guide](USER_GUIDE.md) | End Users | Interactions, controls, visual effects, browser compatibility |
| 3 | [Executive Summary](EXECUTIVE_SUMMARY.md) | Leadership | High-level overview, tech decisions, deployment status, roadmap |
| 4 | [Changelog](CHANGELOG.md) | All | Dated log of project and documentation changes |

## Project File Map

```
matrix-hello/
├── src/
│   ├── index.html          (66 lines)   Entry point HTML, CRT frame, parallax layers
│   ├── main.js           (3193 lines)  Core application: rain, waves, shatter, boot, easter egg, HUD
│   └── style.css           (457 lines)  CRT effects, animations, responsive layout
├── docs/
│   ├── TABLE_OF_CONTENTS.md             This file
│   ├── TECHNICAL.md                     Developer documentation
│   ├── USER_GUIDE.md                    End user guide
│   ├── EXECUTIVE_SUMMARY.md             Leadership overview
│   └── CHANGELOG.md                     Change log
├── scripts/
│   ├── ci.sh                            Local CI pipeline
│   └── new-app.sh                       App scaffold generator
├── .githooks/
│   ├── pre-commit                       Docker compose validation
│   └── post-merge                       Auto-rebuild on pull
├── Dockerfile                           nginx 1.27-alpine, non-root, hardened
├── docker-compose.yml                   Production service definition
├── nginx.conf                           Security headers, gzip, caching
├── Makefile                             Build/deploy/test automation
├── ports.conf                           Port allocation registry
├── DOC_UPDATE.md                        Documentation update plan
├── CLAUDE.md                            AI assistant project context
├── README.md                            Open source README with badges
├── CONTRIBUTING.md                      Contribution guidelines
├── LICENSE                              MIT License
└── .gitignore                           Standard exclusions
```

## Key Architecture Concepts
- **Rendering**: 2D canvas rain + FX composited via Three.js orthographic scene (two texture planes with additive blending)
- **Physics**: 2D wave equation with triple-buffered ping-pong, Phong-shaded surface rendering
- **CRT Effects**: Scanlines, phosphor dots, vignette, boot animation, LED flicker, screen curvature — all CSS
- **Parallax**: 4-layer depth system via Parallax.js + CSS perspective tilt
- **Easter Egg**: Red dot → geo-trace scanner with Mapbox satellite tiles, 8-phase search timeline, HUD overlay, error notifications, reboot
- **Security**: Non-root container, read-only filesystem, all capabilities dropped, CSP headers
