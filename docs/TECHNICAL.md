# Technical Documentation

## Architecture Overview

matrix-hello is a single-page application that renders an interactive Matrix digital rain effect with CRT television aesthetics. It uses no build tools, no frameworks, and no bundler — just three source files served by nginx.

### Rendering Pipeline

```
  rainCanvas (2D)     fxCanvas (2D)
       │                    │
       ▼                    ▼
  THREE.CanvasTexture  THREE.CanvasTexture
       │                    │
       ▼                    ▼
  rainMesh (z=0)       fxMesh (z=0.1, additive blend)
       │                    │
       └────── THREE.Scene ─┘
                    │
           OrthographicCamera
                    │
              WebGLRenderer
                    │
              #matrix-bg DOM
```

The rain and effects are drawn to separate offscreen `<canvas>` elements, then composited via Three.js using an orthographic camera. The FX layer uses `AdditiveBlending` for glow-on-black compositing.

### Animation Systems

#### 1. Matrix Rain (`drawRain()`)
- Column-based character fall with per-column speed, offset, brightness, and scale
- White leading character, green trailing character
- CONFIG: `speed: 0.15`, `density: 0.96`, `fontSize: 16`
- Character set: Katakana + Latin + symbols (88 chars)

#### 2. Wave Simulation (`stepWave()`, `getWaveDisplacement()`)
- Discrete 2D wave equation: `next = 2*cur - prev + c²*(laplacian)`
- Triple-buffered ping-pong (no allocation per frame)
- Grid: `ceil(screenW / waveCellSize) + 2` cells with absorbing boundaries
- `dropStone()`: Randomized elliptical perturbation with secondary splashes
- Displacement applied to rain columns: horizontal refraction, vertical bob, brightness caustics, depth-of-field scale
- Surface rendered with Phong shading: diffuse + Blinn-Phong specular + Fresnel rim glow

#### 3. Gravity Well (`applyGravityWell()`)
- Cursor repels nearby rain columns with cubic falloff
- Radius: 14 columns, horizontal push + speed boost + vertical attraction
- Columns bend away from cursor position

#### 4. Particle System (`addBurst()`, `updateParticles()`)
- Burst of 60 matrix characters on double-click
- Each particle: position, velocity (radial), gravity, friction, lifetime
- Color transition: white → green → fade out

#### 5. Text Shatter (`triggerShatter()`, `reassembleText()`)
- Text pre-split into individual `<span>` elements at init
- Trigger: mouse enters `#hello-text` bounding box (15px padding)
- Scatter: Physics-based explosion from mouse position
  - Force: 100-350px, direction: radial from impact point
  - Gravity: `250 * e²` downward
  - Opacity: fades to 0 at ~75% through animation (multiplier: 1.35)
  - Duration: 700ms with cubic ease-out
- Reassembly (after 700ms pause):
  - Random order, staggered 130ms per character
  - Character cycling through matrix charset at 50ms intervals
  - CSS transition snap-back with overshoot easing
  - Green flash on lock-in, fading glow
- 3-second cooldown between triggers

#### 6. CRT Boot Sequence (7 phases, 2.3s total)
| Phase | Time | Effect |
|-------|------|--------|
| 1 | 200ms | Power LED snaps on |
| 2 | 400ms | Horizontal beam warmup line (60% width) |
| 2b | 600ms | Line flickers (3 rapid opacity changes) |
| 3 | 750ms | Line extends to 95% width |
| 4 | 1050ms | Vertical deflection — line becomes full rectangle |
| 5 | 1500ms | Phosphor brightness overshoot flash |
| 6 | 1800ms | Boot screen fades out |
| 7 | 2300ms | Cleanup — DOM removal, enable hints |

Boot screen is contained inside the CRT bezel using CSS variables (`--bezel`).

#### 7. LED Flicker (`flickerLed()`)
- Random 1-3 quick flickers every 4-12 seconds
- Each flick: opacity drops to 10-30% for 30-80ms
- Skipped during boot sequence

#### 8. Red Dot Easter Egg (Multi-phase sequence)

Hidden interactive easter egg triggered by clicking a pulsing red dot.

**Phase 1 — Red Dot Appearance** (`showRedDot()`)
- Appears ~20s after boot completes
- Positioned randomly along screen edge with pulse animation
- Click triggers the full geo-trace sequence

**Phase 2 — Screen Break** (`eggPhaseBreakApart()`)
- Text shatters, screen cracks apart
- Pre-generates all geographic waypoints and stores on `eggSequence`
- Initializes Mapbox GL map (or fallback if unavailable)
- Duration: 1,200ms

**Phase 3 — Geo-Trace Scanner** (`eggPhaseMapHud()`)
- Real satellite map via Mapbox GL JS v3.11.0
- Frame-by-frame `map.jumpTo()` driven by `getSearchGeo(t)`
- 8-phase search timeline (normalized t = 0.0–1.0):

| Phase | Range | State | Zoom | Behavior |
|-------|-------|-------|------|----------|
| 1 | 0.00–0.18 | SCANNING | 4→8 | Start → wrong position 1 |
| 2 | 0.18–0.25 | ACQUIRING | 8→9 | Hover wrong1 with wobble |
| 3 | 0.25–0.37 | SIGNAL LOST | 9→7 | Jerk away, zoom pullback |
| 4 | 0.37–0.47 | REACQUIRING | 7→11 | Jerk1 → wrong position 2 |
| 5 | 0.47–0.54 | ACQUIRING | 11→12 | Hover wrong2 with wobble |
| 6 | 0.54–0.66 | SIGNAL LOST | 12→10 | Jerk away, zoom pullback |
| 7 | 0.66–0.76 | CONVERGING | 10→16 | Jerk2 → real coordinates |
| 8 | 0.76–1.00 | LOCKED | 16→18 | Hold real, final zoom |

- Wrong positions offset ±0.3°/0.4° (nearly another town)
- Pre-generated `jerkBearing1`/`jerkBearing2` for stable camera rotation
- `drawSignalLostOverlay()`: red flash, static noise, 64px warning bar, typewriter errors
- HUD: targeting reticle (centered ±2px jitter, ±6px during SIGNAL LOST), status bar, callout panel, crosshair sweep, grid overlay
- Duration: 11,000ms

**Phase 4 — Ground Break** (`eggPhaseGroundBreak()`)
- Captures final map frame as static image
- Shatter effect on satellite view
- Duration: 800ms

**Phase 5 — Glitch & Reboot**
- Full-screen glitch corruption overlay
- CRT shutdown animation
- Complete system reboot (boot sequence replays)

**Fallback Path** (`eggPhaseMapZoomFallback()`)
- Procedural map using seeded random (`srand()`)
- Matching 8-phase timeline via `getFbSearchOffset(t)` / `getFbSearchState(t)`
- Identical HUD and error overlays via shared `drawSignalLostOverlay()`
- Viewer's real geo data displayed in surveillance callout

#### 9. Typewriter (`typewrite()`)
- Cycles through 6 Matrix-themed messages
- Type speed: 70-120ms per char, delete speed: 30ms
- Blinking cursor via `.tw-cursor` span with CSS `step-end` animation
- 2.2s pause at end of each message

### Parallax System

4-layer depth via Parallax.js:
| Layer | Depth | Content |
|-------|-------|---------|
| 0.10 | Background | Matrix rain (Three.js canvas) |
| 0.60 | Mid | Overlay text (WAKE UP, typewriter) |
| 0.0 | Static | Screen flash |
| 0.03 | Near-static | Scanlines |

Additional CSS perspective tilt (`perspective(1500px) rotateY/rotateX`) derived from mouse position or device gyroscope. Max tilt: 2.5°, lerped with 0.05 friction.

### CRT Visual Effects (CSS)

- **Scanlines**: 1px repeating gradient, 25% opacity
- **Vignette**: Radial gradient darkening edges (65% opacity at corners)
- **Phosphor dots**: RGB sub-pixel repeating gradient (2% opacity, screen blend)
- **Screen curvature**: 12px border-radius on scene + curved glass shadow on frame
- **Flicker**: 0.1s infinite body opacity animation (0.5% variation)
- **Scanline sweep**: 120px gradient bar sweeping top-to-bottom every 6s
- **Frame**: `clamp(18px, 3vw, 45px)` solid border with multi-layer box-shadow for bevel depth

## Security Model

### Container Security
- **Base image**: `nginx:1.27-alpine` (minimal attack surface)
- **Non-root**: Runs as `nginx` user (UID 101)
- **Read-only filesystem**: `read_only: true` in compose
- **Capabilities**: All dropped (`cap_drop: ALL`)
- **No privilege escalation**: `no-new-privileges: true`
- **Resource limits**: 256MB RAM, 1.0 CPU
- **tmpfs mounts**: `/tmp`, `/var/cache/nginx`, `/var/run` (owned by nginx user)
- **Healthcheck**: wget-based, 30s interval

### HTTP Security Headers
| Header | Value |
|--------|-------|
| X-Frame-Options | SAMEORIGIN |
| X-Content-Type-Options | nosniff |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| Content-Security-Policy | default-src 'self'; script-src 'self' 'unsafe-inline' cdnjs; style-src 'self' 'unsafe-inline' api.mapbox.com; img-src 'self' data: blob:; connect-src 'self' cdnjs ipinfo.io api.mapbox.com *.tiles.mapbox.com events.mapbox.com; worker-src blob:; object-src 'none'; frame-ancestors 'self' |

### Caching
- CSS/JS: 1-hour expiry with `Cache-Control: public, immutable`
- Cache busting via query string versioning (`?v=YYYYMMDD[letter]`)
- Gzip enabled for text, CSS, JS, JSON (min 256 bytes)

## Deployment

### Production
```bash
# Build and start
sg docker -c "docker compose -f /home/straplocked/prod/matrix-hello/docker-compose.yml up -d --build"

# Or via Makefile (from parent directory)
make build-matrix-hello && make up-matrix-hello
```

Port: `192.168.1.76:3001` → container `8080`

### Development Preview
```bash
# Python HTTP server on port 3099 (via .claude/launch.json)
python3 -m http.server 3099 --directory src
```

Note: WebGL is not available in the preview environment. Three.js will crash the IIFE, preventing boot sequence and shatter code from executing. Full testing requires a real browser on port 3001.

### Cache Busting
When updating CSS or JS, bump the version query string in `index.html`:
```html
<link rel="stylesheet" href="style.css?v=20260304m">
<script src="main.js?v=20260304m"></script>
```

Convention: `YYYYMMDD` + incrementing letter suffix (a, b, c...).

## CI/CD
- **Pre-commit hook**: Validates all `docker-compose.yml` files and checks port conflicts
- **Post-merge hook**: Auto-rebuilds containers for changed apps
- **CI script**: `scripts/ci.sh` — lint, build, start, test pipeline
- **Scaffold**: `scripts/new-app.sh <name> <port>` — generates new app boilerplate

## Dependencies (CDN)
| Library | Version | Purpose |
|---------|---------|---------|
| Three.js | r128 | WebGL rendering, canvas texture compositing |
| Parallax.js | 3.1.0 | Mouse/gyroscope-driven parallax layers |
| Mapbox GL JS | 3.11.0 | Satellite map tiles for geo-trace easter egg |

No npm, no build step, no local dependencies.

## External APIs
| Service | Usage | Privacy |
|---------|-------|---------|
| ipinfo.io | Client-side geo-IP lookup (lat/lng, city, ISP) | Viewer's browser makes the request directly |
| Mapbox | Satellite map tiles during easter egg sequence | API key required, tiles loaded on-demand |
