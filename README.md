# Matrix Hello

An interactive Matrix-themed web visualization with CRT television aesthetics. Features real-time digital rain, physics-based wave ripples, parallax depth, and a cinematic text shatter effect — all in vanilla JavaScript with zero build tools.

![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-nginx%201.27--alpine-blue)
![No Build](https://img.shields.io/badge/build-none%20required-brightgreen)

## Features

- **Matrix Digital Rain** — Cascading katakana, Latin, and symbol characters with per-column physics
- **CRT TV Aesthetic** — Realistic boot sequence, scanlines, phosphor dots, vignette, screen curvature, LED flicker
- **Physics-Based Ripples** — Click to drop "stones" into the rain using a 2D wave equation simulation with Phong shading
- **Text Shatter Effect** — Mouse over [WAKE UP] to trigger a bullet-impact explosion with Matrix-decode reassembly
- **Parallax Depth** — 4-layer parallax with CSS perspective tilt (mouse + gyroscope)
- **Interactive Controls** — Click for ripples, double-click for particle bursts, hold to freeze with glitch effects
- **Hardened Container** — Non-root nginx, read-only filesystem, all capabilities dropped, CSP headers

## Quick Start

### Docker (recommended)

```bash
docker compose up -d --build
```

Open `http://localhost:3001` in your browser.

### Local Development

```bash
# Serve the src/ directory with any static file server
python3 -m http.server 3099 --directory src
```

Open `http://localhost:3099`. Note: This serves files directly without security headers.

## Configuration

Edit `docker-compose.yml` to change the port:

```yaml
ports:
  - "0.0.0.0:3001:8080"  # Change 3001 to your desired port
```

## Interactions

| Action | Effect |
|--------|--------|
| Move mouse | Rain bends away, parallax shifts, screen tilts |
| Click | Physics-based ripple wave |
| Double-click | Burst of 60 matrix characters |
| Hold (~180ms) | Freeze rain with glitch effects |
| Cross [WAKE UP] text | Bullet shatter + Matrix reassembly |

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | Vanilla JavaScript (ES5) |
| 3D Rendering | [Three.js r128](https://threejs.org/) (CDN) |
| Parallax | [Parallax.js 3.1.0](https://github.com/wagerfield/parallax) (CDN) |
| Server | nginx 1.27 Alpine |
| Container | Docker Compose |

No npm. No webpack. No transpilation. Just three source files and a Dockerfile.

## Project Structure

```
matrix-hello/
├── src/
│   ├── index.html     Page structure and parallax layers
│   ├── main.js        All application logic (1011 lines)
│   └── style.css      CRT effects and animations (457 lines)
├── docs/              Technical, user, and leadership documentation
├── Dockerfile         Hardened nginx container
├── docker-compose.yml Service definition
├── nginx.conf         Security headers, gzip, caching
└── Makefile           Build/deploy automation
```

## Security

The Docker container is hardened with:
- Non-root `nginx` user
- Read-only root filesystem
- All Linux capabilities dropped (`cap_drop: ALL`)
- No privilege escalation (`no-new-privileges`)
- Resource limits (256MB RAM, 1 CPU)
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options, XSS-Protection

## Documentation

Detailed documentation is in the `docs/` directory:
- [Table of Contents](docs/TABLE_OF_CONTENTS.md) — Project overview and file map
- [Technical Guide](docs/TECHNICAL.md) — Architecture, rendering pipeline, security model
- [User Guide](docs/USER_GUIDE.md) — Interactions and visual effects
- [Executive Summary](docs/EXECUTIVE_SUMMARY.md) — Leadership-level overview

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
