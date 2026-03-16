(function () {
    'use strict';

    // --- Configuration ---
    var CONFIG = {
        chars: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
               'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*',
        fontSize: 16,
        bgAlpha: 0.05,
        speed: 0.15,
        density: 0.96,
        gravityRadius: 14,
        trailLength: 30,
        waveCellSize: 2,
        waveSpeed: 0.45,
        waveDamping: 0.988,
        waveDropRadius: 48,
        waveDropStrength: 40,
        waveStepsPerFrame: 2,
        ambientDropInterval: 300,
        ambientDropStrength: 6,
        ambientDropRadius: 12,
        ambientSwellScale: 0.4,
        // Drop rate limiting
        dropCooldownMs: 200,
        dropBudgetMax: 5,
        dropRechargeMs: 2000,
        particleCount: 60,
        particleLife: 80,
        holdThreshold: 180,
        tiltMax: 2.5,
        tiltFriction: 0.05,
        // Red Dot Easter Egg
        redDotDelay: 20000,
        redDotRepositionInterval: 15000,
        redDotHitRadius: 40,
        redDotPulseSpeed: 0.03,
        redDotMinAlpha: 0.08,
        redDotMaxAlpha: 0.55,
        redDotFadeInDuration: 8000,
        redDotRadius: 3,
        eggBreakDuration: 1200,
        eggMapDuration: 11000,
        eggGroundBreakDuration: 800,
        eggShutdownDuration: 2000,
        eggBlackDuration: 2500,
        // Mapbox (public access token — safe for client-side)
        mapboxToken: 'pk.eyJ1Ijoic3RyYXBsb2NrZWQiLCJhIjoiY21tY2x0d3ExMDduejJycHl5M3pkbW5mcyJ9.7KPsIucFHqFDz9DTNjd7bw'
    };

    var MESSAGES = [
        '> follow the white rabbit',
        '> there is no spoon',
        '> the construct is real',
        '> free your mind',
        '> knock knock, neo',
        '> the matrix has you',
        '> what is the matrix?',
        '> everything that has a beginning has an end',
        '> i know kung fu',
        '> you have to let it all go',
        '> welcome to the desert of the real',
        '> the answer is out there',
        '> do not try and bend the spoon',
        '> choice is an illusion',
        '> i can only show you the door',
        '> the body cannot live without the mind',
        '> fate, it seems, is not without a sense of irony',
        '> some rules can be bent, others can be broken',
        '> remember, all i am offering is the truth',
        '> you have been living in a dream world'
    ];

    // --- State ---
    var mouse = {
        x: -500, y: -500,
        rawX: -500, rawY: -500,
        trail: [],
        down: false,
        downTime: 0,
        frozen: false,
        onScreen: false
    };

    var particles = [];
    var holdTimer = null;

    // --- 3D Tilt State ---
    var tilt = { x: 0, y: 0, targetX: 0, targetY: 0 };
    var deviceTilt = { beta: 0, gamma: 0, active: false };

    // --- Wave Simulation Buffers (triple-buffer ping-pong) ---
    var waveW, waveH;
    var waveBuf = [null, null, null];
    var waveIdx = 0;
    var waveActive = false;
    var waveMaxAmp = 0;

    // --- Drop Rate Limiting ---
    var dropBudget = CONFIG.dropBudgetMax;
    var lastDropTime = 0;
    var lastRechargeTime = 0;

    // --- Canvases ---
    var rainCanvas = document.createElement('canvas');
    var rainCtx = rainCanvas.getContext('2d');
    var fxCanvas = document.createElement('canvas');
    var fxCtx = fxCanvas.getContext('2d');

    var columns, drops;

    function initRain() {
        rainCanvas.width = window.innerWidth;
        rainCanvas.height = window.innerHeight;
        fxCanvas.width = window.innerWidth;
        fxCanvas.height = window.innerHeight;

        columns = Math.floor(rainCanvas.width / CONFIG.fontSize);
        drops = [];
        for (var i = 0; i < columns; i++) {
            var spd = 0.25 + Math.random() * CONFIG.speed;
            drops.push({
                y: Math.random() * -100,
                speed: spd,
                baseSpeed: spd,
                offsetX: 0,       // horizontal displacement (pixels)
                offsetY: 0,       // extra vertical displacement (pixels)
                brightness: 1.0,  // brightness multiplier
                scale: 1.0        // character size multiplier
            });
        }
        rainCtx.fillStyle = '#000000';
        rainCtx.fillRect(0, 0, rainCanvas.width, rainCanvas.height);

        initWaveField();
    }

    // --- Wave Simulation (2D Wave Equation — video game height-map approach) ---
    // Uses discrete wave equation: next = 2*cur - prev + c²*(laplacian)
    // Three pre-allocated buffers cycle without allocation (ping-pong)
    // Normal-based Phong shading for 3D surface appearance

    function initWaveField() {
        waveW = Math.ceil(rainCanvas.width / CONFIG.waveCellSize) + 2;
        waveH = Math.ceil(rainCanvas.height / CONFIG.waveCellSize) + 2;
        var size = waveW * waveH;
        waveBuf[0] = new Float32Array(size);
        waveBuf[1] = new Float32Array(size);
        waveBuf[2] = new Float32Array(size);
        waveIdx = 0;
    }

    // Check if a user drop is allowed (rate limiting + budget)
    function canDrop() {
        var now = Date.now();
        // Recharge budget over time
        if (now - lastRechargeTime >= CONFIG.dropRechargeMs && dropBudget < CONFIG.dropBudgetMax) {
            dropBudget = Math.min(CONFIG.dropBudgetMax,
                dropBudget + Math.floor((now - lastRechargeTime) / CONFIG.dropRechargeMs));
            lastRechargeTime = now;
        }
        // Cooldown between drops
        if (now - lastDropTime < CONFIG.dropCooldownMs) return false;
        // Budget check
        if (dropBudget <= 0) return false;
        return true;
    }

    function consumeDrop() {
        lastDropTime = Date.now();
        dropBudget--;
        if (lastRechargeTime === 0) lastRechargeTime = Date.now();
    }

    // Drop a "stone" into the wave field — organic, randomized perturbation
    function dropStone(px, py) {
        var cur = waveBuf[waveIdx];
        var cx = Math.floor(px / CONFIG.waveCellSize);
        var cy = Math.floor(py / CONFIG.waveCellSize);
        var radius = CONFIG.waveDropRadius * (0.7 + Math.random() * 0.6);
        var strength = CONFIG.waveDropStrength * (0.6 + Math.random() * 0.8);
        var radiusSq = radius * radius;

        // Randomized ellipse for organic shape
        var stretchX = 0.8 + Math.random() * 0.4;
        var stretchY = 0.8 + Math.random() * 0.4;
        var angle = Math.random() * Math.PI;
        var cosA = Math.cos(angle);
        var sinA = Math.sin(angle);

        // Precompute half-pi / radius for falloff
        var invR = Math.PI * 0.5 / radius;

        // Clamp loop bounds to grid
        var yMin = Math.max(-radius, 1 - cy);
        var yMax = Math.min(radius, waveH - 2 - cy);
        var xMin = Math.max(-radius, 1 - cx);
        var xMax = Math.min(radius, waveW - 2 - cx);

        for (var dy = yMin; dy <= yMax; dy++) {
            var rowIdx = (cy + dy) * waveW + cx;
            for (var dx = xMin; dx <= xMax; dx++) {
                // Quick squared-distance reject (skip sqrt for most cells)
                if (dx * dx + dy * dy > radiusSq) continue;
                // Rotate and stretch for elliptical drop
                var rx = (dx * cosA - dy * sinA) * stretchX;
                var ry = (dx * sinA + dy * cosA) * stretchY;
                var distSq = rx * rx + ry * ry;
                if (distSq > radiusSq) continue;
                var dist = Math.sqrt(distSq);
                var falloff = Math.cos(dist * invR);
                cur[rowIdx + dx] -= strength * falloff * falloff * (0.85 + Math.random() * 0.3);
            }
        }

        // One secondary ripple (reduced from 3 for performance)
        var ox = cx + Math.round((Math.random() - 0.5) * radius * 1.2);
        var oy = cy + Math.round((Math.random() - 0.5) * radius * 1.2);
        var sr = Math.floor(radius * (0.2 + Math.random() * 0.25));
        var ss = strength * (0.15 + Math.random() * 0.2);
        var srSq = sr * sr;
        var invSR = Math.PI * 0.5 / sr;
        var sy2Min = Math.max(-sr, 1 - oy);
        var sy2Max = Math.min(sr, waveH - 2 - oy);
        var sx2Min = Math.max(-sr, 1 - ox);
        var sx2Max = Math.min(sr, waveW - 2 - ox);
        for (var dy2 = sy2Min; dy2 <= sy2Max; dy2++) {
            var sRowIdx = (oy + dy2) * waveW + ox;
            for (var dx2 = sx2Min; dx2 <= sx2Max; dx2++) {
                var sd2 = dx2 * dx2 + dy2 * dy2;
                if (sd2 > srSq) continue;
                var sf = Math.cos(Math.sqrt(sd2) * invSR);
                cur[sRowIdx + dx2] -= ss * sf * sf;
            }
        }
        waveActive = true;
    }

    // Advance the wave simulation one time step
    function stepWave() {
        var cur = waveBuf[waveIdx];
        var prev = waveBuf[(waveIdx + 2) % 3];
        var next = waveBuf[(waveIdx + 1) % 3];

        var speed = CONFIG.waveSpeed;
        var damping = CONFIG.waveDamping;
        var maxAmp = 0;

        for (var y = 1; y < waveH - 1; y++) {
            for (var x = 1; x < waveW - 1; x++) {
                var idx = y * waveW + x;
                var laplacian = cur[idx - 1] + cur[idx + 1] +
                                cur[idx - waveW] + cur[idx + waveW] - 4.0 * cur[idx];
                var val = (2.0 * cur[idx] - prev[idx] + speed * laplacian) * damping;
                next[idx] = val;
                // Track max amplitude (sample every 4th cell for speed)
                if ((x & 3) === 0 && (y & 3) === 0) {
                    var abs = val > 0 ? val : -val;
                    if (abs > maxAmp) maxAmp = abs;
                }
            }
        }

        // Absorbing boundary (prevents reflections off edges)
        for (var x = 0; x < waveW; x++) {
            next[x] = 0;
            next[(waveH - 1) * waveW + x] = 0;
        }
        for (var y = 0; y < waveH; y++) {
            next[y * waveW] = 0;
            next[y * waveW + waveW - 1] = 0;
        }

        waveIdx = (waveIdx + 1) % 3;
        waveMaxAmp = maxAmp;
        // Mark wave as inactive when amplitude drops below visibility threshold
        if (maxAmp < 0.15) waveActive = false;
    }

    // Sample wave displacement for a rain column at pixel position (px, py)
    function getWaveDisplacement(px, py) {
        var cur = waveBuf[waveIdx];
        var gx = Math.floor(px / CONFIG.waveCellSize);
        var gy = Math.floor(py / CONFIG.waveCellSize);

        if (gx < 2 || gx >= waveW - 2 || gy < 2 || gy >= waveH - 2) {
            return { dx: 0, dy: 0, brightness: 0, scale: 0 };
        }

        var idx = gy * waveW + gx;
        var h = cur[idx];

        // Central-difference gradient (surface slope)
        var dhx = (cur[idx + 1] - cur[idx - 1]) * 0.5;
        var dhy = (cur[idx + waveW] - cur[idx - waveW]) * 0.5;

        // Laplacian for caustic brightness (light focusing where curvature > 0)
        var laplacian = cur[idx - 1] + cur[idx + 1] + cur[idx - waveW] + cur[idx + waveW] - 4.0 * h;

        return {
            dx: dhx * 4.0,                                        // refraction-like horizontal shift
            dy: h * 1.5,                                           // vertical bob from wave height
            brightness: h * 0.06 + Math.max(0, laplacian) * 0.04, // height + caustic brightness
            scale: h * 0.03                                        // depth-of-field scale
        };
    }

    // Apply wave displacement to all rain columns
    function applyWaveToColumns() {
        var cur = waveBuf[waveIdx];
        // Quick check: any wave activity?
        // Always apply — ambient waves keep the surface alive

        for (var c = 0; c < columns; c++) {
            if (!drops[c]) continue;
            var colX = c * CONFIG.fontSize + CONFIG.fontSize / 2;
            var colY = drops[c].y * CONFIG.fontSize;
            var w = getWaveDisplacement(colX, colY);

            drops[c].offsetX += (w.dx - drops[c].offsetX) * 0.3;
            drops[c].offsetY += (w.dy - drops[c].offsetY) * 0.3;
            drops[c].brightness = 1.0 + w.brightness;
            drops[c].scale = 1.0 + w.scale;
            drops[c].speed = drops[c].baseSpeed + w.dy * 0.15;
        }
    }

    // Render the wave surface with 3D Phong shading on fxCanvas
    function renderWaveSurface() {
        var cur = waveBuf[waveIdx];
        var cell = CONFIG.waveCellSize;

        // Light direction (upper-left, angled toward viewer)
        var lx = -0.4, ly = -0.6, lz = 0.7;
        var lLen = Math.sqrt(lx * lx + ly * ly + lz * lz);
        lx /= lLen; ly /= lLen; lz /= lLen;

        // Half-vector for Blinn-Phong specular (view = 0, 0, 1)
        var hx = lx, hy = ly, hz = lz + 1.0;
        var hLen = Math.sqrt(hx * hx + hy * hy + hz * hz);
        hx /= hLen; hy /= hLen; hz /= hLen;

        for (var gy = 2; gy < waveH - 2; gy++) {
            for (var gx = 2; gx < waveW - 2; gx++) {
                var idx = gy * waveW + gx;
                var h = cur[idx];

                if (Math.abs(h) < 0.2) continue;

                // Surface gradient
                var ghx = (cur[idx + 1] - cur[idx - 1]) * 0.5;
                var ghy = (cur[idx + waveW] - cur[idx - waveW]) * 0.5;

                // Normal vector: (-ghx, -ghy, 1) normalized
                var nLen = Math.sqrt(ghx * ghx + ghy * ghy + 1.0);
                var nx = -ghx / nLen;
                var ny = -ghy / nLen;
                var nz = 1.0 / nLen;

                // Diffuse lighting
                var diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);

                // Blinn-Phong specular
                var specDot = Math.max(0, nx * hx + ny * hy + nz * hz);
                var specular = Math.pow(specDot, 48);

                // Fresnel rim glow (brighter at grazing angles)
                var fresnel = 1.0 - nz;
                fresnel *= fresnel * fresnel;

                // Height-based tint (crests bright, troughs dark)
                var heightTint = h > 0 ? 1.0 : 0.35;

                // Composite intensity
                var intensity = (diffuse * 0.5 + specular * 1.6 + fresnel * 0.4) * heightTint;
                var alpha = Math.min(0.85, Math.abs(h) * 0.055 * (intensity + 0.15));

                if (alpha < 0.02) continue;

                var px = gx * cell;
                var py = gy * cell;

                if (specular > 0.25) {
                    // White/cyan specular highlight
                    var sA = Math.min(0.95, alpha + specular * 0.5);
                    fxCtx.fillStyle = 'rgba(200, 255, 220, ' + sA + ')';
                } else if (h > 0) {
                    // Bright green crest
                    fxCtx.fillStyle = 'rgba(0, 255, 65, ' + alpha + ')';
                } else {
                    // Dark green trough
                    fxCtx.fillStyle = 'rgba(0, 80, 25, ' + (alpha * 0.5) + ')';
                }
                fxCtx.fillRect(px, py, cell, cell);
            }
        }

        // Impact glow at recent drop sites (fades quickly)
        // Tracked via the drop impact flash array
    }

    // --- Ambient Water Movement ---
    // Continuous random perturbations + organic swell to simulate living water surface
    var ambientTimer = 0;
    var ambientFrame = 0;

    function ambientWaves() {
        ambientFrame++;
        ambientTimer++;

        var cur = waveBuf[waveIdx];

        // Random drops across the surface — like rain hitting water
        if (ambientTimer >= Math.floor(CONFIG.ambientDropInterval / 16)) {
            ambientTimer = 0;
            var px = 50 + Math.random() * (rainCanvas.width - 100);
            var py = 50 + Math.random() * (rainCanvas.height - 100);
            var cx = Math.floor(px / CONFIG.waveCellSize);
            var cy = Math.floor(py / CONFIG.waveCellSize);
            var radius = CONFIG.ambientDropRadius * (0.6 + Math.random() * 0.8);
            var strength = CONFIG.ambientDropStrength * (0.5 + Math.random());
            // Randomly positive or negative for variety
            if (Math.random() > 0.5) strength = -strength;

            for (var dy = -radius; dy <= radius; dy++) {
                for (var dx = -radius; dx <= radius; dx++) {
                    var gx = cx + dx;
                    var gy = cy + dy;
                    if (gx < 1 || gx >= waveW - 1 || gy < 1 || gy >= waveH - 1) continue;
                    var dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= radius) {
                        var falloff = Math.cos(dist / radius * Math.PI * 0.5);
                        cur[gy * waveW + gx] += strength * falloff * falloff;
                    }
                }
            }
        }

        // Organic swell — slow sine waves across the entire surface
        // Multiple overlapping frequencies for natural look
        var t = ambientFrame * 0.008;
        var scale = CONFIG.ambientSwellScale;
        for (var y = 2; y < waveH - 2; y += 3) {
            for (var x = 2; x < waveW - 2; x += 3) {
                var idx = y * waveW + x;
                // Three overlapping sine waves at different angles and speeds
                var s1 = Math.sin(x * 0.015 + t * 1.1) * Math.cos(y * 0.012 + t * 0.7);
                var s2 = Math.sin(x * 0.008 - t * 0.6 + y * 0.01) * 0.7;
                var s3 = Math.cos(x * 0.022 + y * 0.018 + t * 1.4) * 0.4;
                var swell = (s1 + s2 + s3) * scale;
                // Blend gently — don't overwrite, nudge toward swell value
                cur[idx] += (swell - cur[idx]) * 0.003;
            }
        }
    }

    // --- Particles ---
    function addBurst(x, y) {
        for (var i = 0; i < CONFIG.particleCount; i++) {
            var angle = Math.random() * Math.PI * 2;
            var velocity = 3 + Math.random() * 8;
            particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity - 2,
                char: CONFIG.chars[Math.floor(Math.random() * CONFIG.chars.length)],
                life: CONFIG.particleLife,
                maxLife: CONFIG.particleLife,
                size: CONFIG.fontSize + Math.floor(Math.random() * 8)
            });
        }
    }

    function updateParticles() {
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.vx *= 0.99;
            p.life--;

            var alpha = p.life / p.maxLife;
            fxCtx.font = 'bold ' + p.size + 'px monospace';

            if (alpha > 0.6) {
                fxCtx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
            } else {
                var g = Math.floor(200 * alpha + 55);
                fxCtx.fillStyle = 'rgba(0, ' + g + ', 65, ' + alpha + ')';
            }
            fxCtx.fillText(p.char, p.x, p.y);
            fxCtx.shadowColor = '#00ff41';
            fxCtx.shadowBlur = 8 * alpha;
            fxCtx.fillText(p.char, p.x, p.y);
            fxCtx.shadowBlur = 0;

            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    // --- Mouse Trail ---
    function drawTrail() {
        if (mouse.trail.length < 2) return;
        fxCtx.font = CONFIG.fontSize + 'px monospace';

        for (var i = 1; i < mouse.trail.length; i++) {
            var t = mouse.trail[i];
            var alpha = (i / mouse.trail.length);
            for (var j = 0; j < 3; j++) {
                var char = CONFIG.chars[Math.floor(Math.random() * CONFIG.chars.length)];
                var ox = (Math.random() - 0.5) * 20;
                var oy = (Math.random() - 0.5) * 20;
                fxCtx.fillStyle = 'rgba(0, 255, 65, ' + (alpha * 0.6) + ')';
                fxCtx.fillText(char, t.x + ox, t.y + oy);
            }
        }

        var head = mouse.trail[mouse.trail.length - 1];
        fxCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        fxCtx.fillText(CONFIG.chars[Math.floor(Math.random() * CONFIG.chars.length)], head.x, head.y);
    }

    // --- Cursor Glow ---
    function drawCursorGlow() {
        if (!mouse.onScreen) return;

        var radius = CONFIG.gravityRadius * CONFIG.fontSize;
        var gradient = fxCtx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, radius);
        gradient.addColorStop(0, 'rgba(0, 255, 65, 0.25)');
        gradient.addColorStop(0.3, 'rgba(0, 255, 65, 0.10)');
        gradient.addColorStop(0.7, 'rgba(0, 180, 40, 0.03)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        fxCtx.fillStyle = gradient;
        fxCtx.beginPath();
        fxCtx.arc(mouse.x, mouse.y, radius, 0, Math.PI * 2);
        fxCtx.fill();

        var dotGrad = fxCtx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 6);
        dotGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        dotGrad.addColorStop(1, 'rgba(0, 255, 65, 0)');
        fxCtx.fillStyle = dotGrad;
        fxCtx.beginPath();
        fxCtx.arc(mouse.x, mouse.y, 6, 0, Math.PI * 2);
        fxCtx.fill();
    }

    // --- Gravity Well ---
    function applyGravityWell() {
        if (!mouse.onScreen) return;
        var cursorCol = Math.floor(mouse.x / CONFIG.fontSize);
        var cursorRow = mouse.y / CONFIG.fontSize;

        for (var i = 0; i < columns; i++) {
            var colDist = i - cursorCol;
            var absDist = Math.abs(colDist);
            if (absDist < CONFIG.gravityRadius && drops[i]) {
                var influence = 1.0 - (absDist / CONFIG.gravityRadius);
                influence = influence * influence * influence;

                // Speed boost
                drops[i].speed = drops[i].baseSpeed + influence * 6.0;

                // Vertical attraction
                var rowDist = cursorRow - drops[i].y;
                if (Math.abs(rowDist) > 2) {
                    drops[i].y += rowDist * influence * 0.03;
                }

                // Horizontal push — columns bend away from cursor
                var pushDir = colDist === 0 ? 0 : (colDist > 0 ? 1 : -1);
                var pushStrength = influence * 12;
                drops[i].offsetX += (pushDir * pushStrength - drops[i].offsetX) * 0.08;
            }
        }
    }

    // --- Freeze Glitch ---
    function drawFreezeGlitch() {
        if (!mouse.frozen) return;
        rainCtx.font = CONFIG.fontSize + 'px monospace';
        for (var i = 0; i < columns; i++) {
            if (Math.random() > 0.92) {
                var char = CONFIG.chars[Math.floor(Math.random() * CONFIG.chars.length)];
                var x = i * CONFIG.fontSize;
                var y = Math.random() * rainCanvas.height;
                var colors = ['#ff0041', '#ffffff', '#00ff41', '#41ffff', '#ff00ff'];
                rainCtx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
                rainCtx.fillText(char, x, y);
            }
        }
        if (Math.random() > 0.85) {
            var barY = Math.random() * rainCanvas.height;
            var barH = 2 + Math.random() * 6;
            var shift = (Math.random() - 0.5) * 40;
            var imgData = rainCtx.getImageData(0, barY, rainCanvas.width, barH);
            rainCtx.putImageData(imgData, shift, barY);
        }
    }

    // --- Screen Flash ---
    var flashEl = document.getElementById('screen-flash');
    function screenFlash(color, duration) {
        flashEl.style.background = color || 'rgba(0, 255, 65, 0.3)';
        flashEl.style.opacity = '1';
        setTimeout(function() { flashEl.style.opacity = '0'; }, duration || 100);
    }

    // --- Main Draw Loop ---
    function drawRain() {
        if (eggSequence && eggSequence.active && eggSequence.phase > 0) return;
        rainCtx.fillStyle = 'rgba(0, 0, 0, ' + CONFIG.bgAlpha + ')';
        rainCtx.fillRect(0, 0, rainCanvas.width, rainCanvas.height);
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

        // Lerp mouse
        mouse.x += (mouse.rawX - mouse.x) * 0.12;
        mouse.y += (mouse.rawY - mouse.y) * 0.12;

        // Gravity well (sets offsetX on nearby columns)
        if (!mouse.frozen) {
            applyGravityWell();
        }

        // Wave simulation — advance physics, ambient movement, apply to columns
        // Run full sim when waves are active; single step for ambient when quiet
        if (waveActive) {
            for (var step = 0; step < CONFIG.waveStepsPerFrame; step++) {
                stepWave();
            }
        } else {
            stepWave();
        }
        ambientWaves();
        applyWaveToColumns();

        // Draw rain columns with displacement
        for (var i = 0; i < columns; i++) {
            if (Math.random() > CONFIG.density) continue;

            var drop = drops[i];

            if (!mouse.frozen) {
                drop.y += drop.speed;
                drop.speed += (drop.baseSpeed - drop.speed) * 0.02;
            }

            // Decay offsets back to zero when no effects active
            drop.offsetX *= 0.92;
            drop.offsetY *= 0.92;
            drop.brightness += (1.0 - drop.brightness) * 0.05;
            drop.scale += (1.0 - drop.scale) * 0.05;

            // Actual render position with displacement
            var baseX = i * CONFIG.fontSize;
            var x = baseX + drop.offsetX;
            var y = drop.y * CONFIG.fontSize + drop.offsetY;

            // Size based on scale (3D depth effect)
            var size = Math.max(8, Math.round(CONFIG.fontSize * drop.scale));
            rainCtx.font = size + 'px monospace';

            var char = CONFIG.chars[Math.floor(Math.random() * CONFIG.chars.length)];

            // Brightness modulation for 3D — crests glow brighter
            var b = Math.min(1.0, Math.max(0.3, drop.brightness));

            // White leading character — brightness affects intensity
            var wR = Math.round(255 * b);
            var wG = Math.round(255 * b);
            var wB = Math.round(255 * b);
            rainCtx.fillStyle = 'rgb(' + wR + ',' + wG + ',' + wB + ')';
            rainCtx.fillText(char, x, y);

            // Green character behind — also brightness modulated
            if (drop.y > 1) {
                var prevChar = CONFIG.chars[Math.floor(Math.random() * CONFIG.chars.length)];
                var gVal = Math.round(255 * b);
                rainCtx.fillStyle = 'rgb(0,' + gVal + ',65)';
                rainCtx.font = CONFIG.fontSize + 'px monospace';
                rainCtx.fillText(prevChar, x, (drop.y - 1) * CONFIG.fontSize + drop.offsetY);
            }

            // Reset
            if (drop.y * CONFIG.fontSize > rainCanvas.height && Math.random() > 0.975) {
                drop.y = 0;
                drop.speed = drop.baseSpeed;
                drop.offsetX = 0;
                drop.offsetY = 0;
                drop.brightness = 1.0;
                drop.scale = 1.0;
            }
        }

        // Effects overlay — wave surface first (3D shaded), then other FX on top
        renderWaveSurface();
        drawTrail();
        drawCursorGlow();
        updateParticles();
        drawFreezeGlitch();
        drawRedDot();
    }

    // --- Three.js Scene ---
    var container = document.getElementById('matrix-bg');
    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    var renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    var rainTexture = new THREE.CanvasTexture(rainCanvas);
    rainTexture.minFilter = THREE.LinearFilter;
    rainTexture.magFilter = THREE.LinearFilter;

    var fxTexture = new THREE.CanvasTexture(fxCanvas);
    fxTexture.minFilter = THREE.LinearFilter;
    fxTexture.magFilter = THREE.LinearFilter;

    var geometry = new THREE.PlaneGeometry(2, 2);
    var rainMaterial = new THREE.MeshBasicMaterial({ map: rainTexture });
    var rainMesh = new THREE.Mesh(geometry, rainMaterial);
    scene.add(rainMesh);

    var fxMaterial = new THREE.MeshBasicMaterial({
        map: fxTexture,
        transparent: true,
        blending: THREE.AdditiveBlending
    });
    var fxMesh = new THREE.Mesh(geometry.clone(), fxMaterial);
    fxMesh.position.z = 0.1;
    scene.add(fxMesh);

    initRain();

    // --- Parallax.js Layer System ---
    var sceneEl = document.getElementById('scene');
    var parallaxInstance = null;
    if (typeof Parallax !== 'undefined') {
        parallaxInstance = new Parallax(sceneEl, {
            relativeInput: false,
            hoverOnly: false,
            scalarX: 25,
            scalarY: 15,
            frictionX: 0.08,
            frictionY: 0.08,
            originX: 0.5,
            originY: 0.5,
            pointerEvents: true
        });
    }

    // --- 3D Perspective Tilt ---
    // Applies CSS perspective + rotateX/Y to the scene container
    // Creates a physical "peering into a tilted monitor" effect
    // Works with mouse on desktop, gyroscope on mobile

    function updateTilt() {
        if (deviceTilt.active) {
            // Mobile gyroscope: gamma = left/right, beta = front/back
            tilt.targetX = Math.max(-CONFIG.tiltMax, Math.min(CONFIG.tiltMax,
                deviceTilt.gamma * 0.08));
            tilt.targetY = Math.max(-CONFIG.tiltMax, Math.min(CONFIG.tiltMax,
                (deviceTilt.beta - 45) * 0.06));
        } else if (mouse.onScreen) {
            // Desktop: derive tilt from lerped mouse position
            var normX = (mouse.x / window.innerWidth - 0.5) * 2;
            var normY = (mouse.y / window.innerHeight - 0.5) * 2;
            tilt.targetX = normX * CONFIG.tiltMax;
            tilt.targetY = -normY * CONFIG.tiltMax;
        } else {
            // Mouse off-screen: ease back to neutral
            tilt.targetX = 0;
            tilt.targetY = 0;
        }

        // Smooth lerp (slower than mouse lerp for cinematic feel)
        tilt.x += (tilt.targetX - tilt.x) * CONFIG.tiltFriction;
        tilt.y += (tilt.targetY - tilt.y) * CONFIG.tiltFriction;

        sceneEl.style.transform = 'perspective(1500px) rotateY(' +
            tilt.x.toFixed(3) + 'deg) rotateX(' +
            tilt.y.toFixed(3) + 'deg)';
    }

    // Device orientation for mobile gyroscope/accelerometer
    window.addEventListener('deviceorientation', function (e) {
        if (e.beta !== null && e.gamma !== null) {
            deviceTilt.active = true;
            deviceTilt.beta = e.beta;
            deviceTilt.gamma = e.gamma;
        }
    });

    function animate() {
        requestAnimationFrame(animate);
        drawRain();
        updateTilt();
        rainTexture.needsUpdate = true;
        fxTexture.needsUpdate = true;
        renderer.render(scene, camera);
    }

    animate();

    // --- Resize ---
    window.addEventListener('resize', function () {
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (!eggSequence.active) {
            initRain();
        }
        if (eggSequence.overlayCanvas) {
            eggSequence.overlayCanvas.width = window.innerWidth;
            eggSequence.overlayCanvas.height = window.innerHeight;
        }
    });

    // --- Mouse Events ---
    document.addEventListener('mousemove', function (e) {
        mouse.rawX = e.clientX;
        mouse.rawY = e.clientY;
        mouse.onScreen = true;
        mouse.trail.push({ x: e.clientX, y: e.clientY });
        if (mouse.trail.length > CONFIG.trailLength) mouse.trail.shift();
    });

    document.addEventListener('mouseleave', function () {
        mouse.onScreen = false;
        mouse.trail = [];
    });

    document.addEventListener('mouseenter', function () {
        mouse.onScreen = true;
    });

    document.addEventListener('mousedown', function (e) {
        mouse.down = true;
        mouse.downTime = Date.now();
        holdTimer = setTimeout(function() {
            mouse.frozen = true;
            screenFlash('rgba(0, 255, 65, 0.15)', 150);
        }, CONFIG.holdThreshold);
    });

    document.addEventListener('mouseup', function (e) {
        mouse.down = false;
        if (mouse.frozen) {
            mouse.frozen = false;
            clearTimeout(holdTimer);
            screenFlash('rgba(255, 255, 255, 0.3)', 120);
            for (var i = 0; i < columns; i++) {
                if (drops[i]) drops[i].speed = drops[i].baseSpeed * 4.0;
            }
        } else {
            clearTimeout(holdTimer);
            // Red dot click check
            if (redDot.active && !eggSequence.active) {
                var rdx = e.clientX - redDot.x;
                var rdy = e.clientY - redDot.y;
                if (Math.sqrt(rdx * rdx + rdy * rdy) <= CONFIG.redDotHitRadius) {
                    triggerEggSequence();
                    return;
                }
            }
            if (canDrop()) {
                consumeDrop();
                dropStone(e.clientX, e.clientY);
                screenFlash('rgba(255, 255, 255, 0.15)', 60);
            }
        }
    });

    document.addEventListener('dblclick', function (e) {
        e.preventDefault();
        addBurst(e.clientX, e.clientY);
        screenFlash('rgba(0, 255, 65, 0.25)', 100);
    });

    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    // --- Typewriter ---
    var typewriterEl = document.getElementById('typewriter');
    var twCursor = document.createElement('span');
    twCursor.className = 'tw-cursor';
    twCursor.textContent = '_';
    var msgIndex = 0;
    var charIndex = 0;
    var isDeleting = false;

    function typewrite() {
        var fullText = MESSAGES[msgIndex];
        var speed;
        if (isDeleting) {
            charIndex--;
            speed = 30;
        } else {
            charIndex++;
            speed = 70 + Math.random() * 50;
        }
        typewriterEl.textContent = fullText.substring(0, charIndex);
        typewriterEl.appendChild(twCursor);
        if (!isDeleting && charIndex === fullText.length) {
            speed = 2200;
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            msgIndex = (msgIndex + 1) % MESSAGES.length;
            speed = 500;
        }
        setTimeout(typewrite, speed);
    }

    typewrite();

    // --- Surveillance Display ---
    // Cycles viewer's own data in the subtitle — IP + geo from ipinfo.io (viewer's browser
    // calls the API directly, so it returns THEIR public IP, not the server's)
    // Browser fingerprint data from client-side APIs
    var subEl = document.getElementById('subtitle');
    var surveillanceLines = [];
    var survIndex = 0;
    var survReady = false;
    var geoData = {};

    // --- Preloaded Mapbox map (created after geo fetch, hidden until egg triggers) ---
    var preloadedMap = null;
    var preloadedMapDiv = null;
    var preloadedMapReady = false;

    function getClientFingerprint() {
        var ua = navigator.userAgent;
        var browser = 'UNKNOWN';
        if (ua.indexOf('Firefox') > -1) browser = 'FIREFOX';
        else if (ua.indexOf('Edg') > -1) browser = 'EDGE';
        else if (ua.indexOf('Chrome') > -1) browser = 'CHROME';
        else if (ua.indexOf('Safari') > -1) browser = 'SAFARI';

        var os = 'UNKNOWN';
        if (ua.indexOf('Windows') > -1) os = 'WINDOWS';
        else if (ua.indexOf('Mac') > -1) os = 'MACOS';
        else if (ua.indexOf('Linux') > -1) os = 'LINUX';
        else if (ua.indexOf('Android') > -1) os = 'ANDROID';
        else if (ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) os = 'IOS';

        var cores = navigator.hardwareConcurrency || '?';
        var res = screen.width + 'x' + screen.height;
        var depth = screen.colorDepth + '-BIT';
        var conn = (navigator.connection && navigator.connection.effectiveType) ? navigator.connection.effectiveType.toUpperCase() : null;
        var mem = navigator.deviceMemory ? navigator.deviceMemory + 'GB' : null;
        var gpu = '';
        try {
            var gl = document.createElement('canvas').getContext('webgl');
            if (gl) {
                var ext = gl.getExtension('WEBGL_debug_renderer_info');
                if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
            }
        } catch (e) {}
        if (gpu.length > 38) gpu = gpu.substring(0, 38);

        return { browser: browser, os: os, cores: cores, res: res, depth: depth, conn: conn, mem: mem, gpu: gpu };
    }

    function buildSurveillanceData() {
        var fp = getClientFingerprint();
        var now = new Date();
        var ts = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + ' ' +
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');

        var ip = geoData.ip || '?.?.?.?';
        var city = geoData.city ? geoData.city.toUpperCase() : null;
        var region = geoData.region ? geoData.region.toUpperCase() : null;
        var country = geoData.country || null;
        var loc = geoData.loc || null;
        var org = geoData.org || null;
        var tz = geoData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UNKNOWN';

        surveillanceLines = [
            'SUBJECT LOCATED // ' + ip,
        ];
        if (city && region && country) {
            surveillanceLines.push('LOCATION: ' + city + ', ' + region + ' // ' + country);
        }
        if (loc) {
            surveillanceLines.push('COORDINATES: ' + loc);
        }
        if (org) {
            // Trim ASN prefix if present (e.g., "AS12345 Comcast")
            var isp = org;
            if (isp.indexOf(' ') > -1 && isp.substring(0, 2) === 'AS') {
                isp = isp.substring(isp.indexOf(' ') + 1);
            }
            surveillanceLines.push('ISP: ' + isp.toUpperCase());
        }
        surveillanceLines.push('HOST: ' + fp.browser + ' // ' + fp.os);
        surveillanceLines.push('DISPLAY: ' + fp.res + ' @ ' + fp.depth);
        surveillanceLines.push('CPU THREADS: ' + fp.cores + (fp.mem ? ' // RAM: ' + fp.mem : ''));
        if (fp.gpu) surveillanceLines.push('GPU: ' + fp.gpu.toUpperCase());
        surveillanceLines.push('TIMESTAMP: ' + ts);
        surveillanceLines.push('TIMEZONE: ' + tz);
        if (fp.conn) surveillanceLines.push('NETWORK: ' + fp.conn);
        surveillanceLines.push('THE SYSTEM SEES YOU');
    }

    // Fetch viewer's public IP + geo from ipinfo.io (viewer's browser makes this call,
    // so the API sees the viewer's IP, not the server's — safe, no server-side leaks)
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://ipinfo.io/json', true);
    xhr.timeout = 4000;
    xhr.onload = function () {
        try {
            geoData = JSON.parse(xhr.responseText);
        } catch (e) {}
        buildSurveillanceData();
        survReady = true;
        preloadMapbox();
    };
    xhr.onerror = xhr.ontimeout = function () {
        buildSurveillanceData();
        survReady = true;
    };
    xhr.send();

    // Preload Mapbox map in a hidden container so tiles are cached before egg triggers
    function preloadMapbox() {
        if (typeof mapboxgl === 'undefined' || !CONFIG.mapboxToken) return;
        if (!geoData.loc) return;
        if (preloadedMap) return; // already preloading

        var parts = geoData.loc.split(',');
        var lat = parseFloat(parts[0]) || 0;
        var lng = parseFloat(parts[1]) || 0;

        preloadedMapDiv = document.createElement('div');
        preloadedMapDiv.id = 'egg-map-preload';
        // Render offscreen but at full size so tiles load at correct resolution
        preloadedMapDiv.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:-1;opacity:0;pointer-events:none;filter:saturate(0.4) brightness(0.7) hue-rotate(90deg);';
        document.body.appendChild(preloadedMapDiv);

        mapboxgl.accessToken = CONFIG.mapboxToken;
        preloadedMap = new mapboxgl.Map({
            container: 'egg-map-preload',
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [lng, lat],
            zoom: 4,
            interactive: false,
            attributionControl: false,
            fadeDuration: 0,
            pitchWithRotate: false,
            preserveDrawingBuffer: true
        });

        preloadedMap.on('load', function () {
            preloadedMapReady = true;
        });
    }

    // Cycle surveillance lines with decode effect + glitch on unstable lines
    var GLITCH_ERRORS = [
        '// SYSTEM APPROXIMATING //',
        '// CANNOT LOCK TRACK //',
        '// SIGNAL DEGRADED //',
        '// TRACE ROUTE FAILED //',
        '// HANDSHAKE TIMEOUT //',
        '// BUFFER OVERFLOW DETECTED //',
        '// PACKET LOSS: RETRYING //',
        '// FINGERPRINT MISMATCH //',
        '// HARDWARE PROBE BLOCKED //',
        '// ACCESS DENIED: RETRY //',
        '// SCAN INCONCLUSIVE //',
        '// DATA CORRUPTED: RESAMPLING //',
        '// SUBSYSTEM UNRESPONSIVE //',
        '// FREQUENCY DRIFT DETECTED //',
        '// CALIBRATION ERROR //',
        '// KERNEL FENCE ACTIVE //',
        '// TELEMETRY INTERRUPTED //',
        '// ENDPOINT UNREACHABLE //',
        '// SYNC LOST: RECOVERING //',
        '// CIPHER NEGOTIATION FAILED //'
    ];

    function isUnstableLine(text) {
        return text.indexOf('CPU') > -1 || text.indexOf('RAM') > -1 ||
               text.indexOf('GPU') > -1 || text.indexOf('NETWORK') > -1;
    }

    function glitchLine(text, intensity) {
        var mChars = CONFIG.chars;
        var out = '';
        for (var i = 0; i < text.length; i++) {
            if (Math.random() < intensity) {
                out += mChars[Math.floor(Math.random() * mChars.length)];
            } else {
                out += text[i];
            }
        }
        return out;
    }

    function playGlitchSequence(target, callback) {
        var mChars = CONFIG.chars;
        var steps = 12 + Math.floor(Math.random() * 8);
        var step = 0;
        var colors = ['#ff0041', '#00ff41', '#41ffff', '#ff00ff', '#ffff00', '#00ff41'];

        function tick() {
            if (step >= steps) {
                // Show error message, then resolve to data
                subEl.style.opacity = '0';
                setTimeout(function () {
                    var errMsg = GLITCH_ERRORS[Math.floor(Math.random() * GLITCH_ERRORS.length)];
                    subEl.textContent = errMsg;
                    subEl.style.color = '#ff0041';
                    subEl.style.opacity = '1';
                    subEl.style.transform = '';
                    setTimeout(function () {
                        subEl.style.opacity = '0';
                        setTimeout(function () {
                            subEl.textContent = target;
                            subEl.style.color = '#ff6041';
                            subEl.style.opacity = '1';
                            setTimeout(function () {
                                subEl.style.color = '';
                                subEl.style.opacity = '';
                                callback();
                            }, 500);
                        }, 80);
                    }, 900);
                }, 60);
                return;
            }

            var progress = step / steps;

            if (Math.random() < 0.25) {
                // Blackout flicker
                subEl.style.opacity = (0.05 + Math.random() * 0.15).toFixed(2);
            } else {
                subEl.style.opacity = (0.5 + Math.random() * 0.5).toFixed(2);
            }

            // Corrupt the text — more corruption early, resolves toward end
            var corruption = Math.max(0.05, 0.8 - progress * 0.9);
            var display = glitchLine(target, corruption);

            // Random length jitter — line appears to cut off or overflow
            if (Math.random() < 0.3) {
                var cutLen = Math.floor(display.length * (0.4 + Math.random() * 0.6));
                display = display.substring(0, cutLen);
            }
            if (Math.random() < 0.15) {
                // Insert garbage block
                var garbage = '';
                for (var g = 0; g < 3 + Math.floor(Math.random() * 5); g++) {
                    garbage += mChars[Math.floor(Math.random() * mChars.length)];
                }
                var insertAt = Math.floor(Math.random() * display.length);
                display = display.substring(0, insertAt) + garbage + display.substring(insertAt);
            }

            subEl.textContent = display;
            subEl.style.color = colors[Math.floor(Math.random() * colors.length)];

            // Horizontal offset jitter
            var jitterX = (Math.random() - 0.5) * 6;
            subEl.style.transform = 'translateX(' + jitterX.toFixed(1) + 'px)';

            step++;
            setTimeout(tick, 30 + Math.random() * 60);
        }

        // Kick off with a brief "signal lost" moment
        subEl.textContent = '// SIGNAL UNSTABLE //';
        subEl.style.color = '#ff0041';
        setTimeout(tick, 200 + Math.random() * 150);
    }

    function cycleSurveillance() {
        if (!survReady || document.body.classList.contains('booting')) {
            setTimeout(cycleSurveillance, 500);
            return;
        }
        if (eggSequence.active) {
            setTimeout(cycleSurveillance, 1000);
            return;
        }

        var target = surveillanceLines[survIndex];
        var unstable = isUnstableLine(target);
        var mChars = CONFIG.chars;

        if (unstable) {
            // Glitch sequence for unstable lines
            playGlitchSequence(target, function () {
                subEl.style.transform = '';
                survIndex = (survIndex + 1) % surveillanceLines.length;
                if (survIndex === 0) buildSurveillanceData();
                setTimeout(cycleSurveillance, 2500);
            });
        } else {
            // Normal decode for stable lines
            var pos = 0;
            function decodeStep() {
                if (pos <= target.length) {
                    var decoded = target.substring(0, pos);
                    var remaining = target.length - pos;
                    var scramble = '';
                    for (var i = 0; i < Math.min(remaining, 6); i++) {
                        scramble += mChars[Math.floor(Math.random() * mChars.length)];
                    }
                    subEl.textContent = decoded + scramble;
                    subEl.style.color = pos < target.length ? '#00ff41' : '';
                    pos++;
                    setTimeout(decodeStep, 25 + Math.random() * 15);
                } else {
                    subEl.textContent = target;
                    subEl.style.color = '';
                    survIndex = (survIndex + 1) % surveillanceLines.length;
                    if (survIndex === 0) buildSurveillanceData();
                    setTimeout(cycleSurveillance, 2500);
                }
            }
            decodeStep();
        }
    }

    // Start surveillance after boot completes
    setTimeout(cycleSurveillance, 3000);

    // --- CRT Boot Sequence ---
    var bootScreen = document.getElementById('boot-screen');
    var bootLine = document.getElementById('boot-line');
    var powerLed = document.getElementById('crt-power-led');

    // Phase 1 (200ms): Power LED snaps on
    setTimeout(function () {
        powerLed.style.opacity = '1';
        powerLed.style.boxShadow = '0 0 4px #00ff41, 0 0 8px #00ff41';
    }, 200);

    // Phase 2 (400ms): Thin horizontal line appears — beam warmup
    setTimeout(function () {
        bootLine.style.transition = 'width 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        bootLine.style.width = '60%';
    }, 400);

    // Phase 2b (600ms): Line flickers — brief dropout
    setTimeout(function () {
        bootLine.style.transition = 'opacity 0.05s';
        bootLine.style.opacity = '0.3';
    }, 600);
    setTimeout(function () {
        bootLine.style.opacity = '1';
    }, 650);
    setTimeout(function () {
        bootLine.style.opacity = '0.5';
    }, 680);
    setTimeout(function () {
        bootLine.style.opacity = '1';
    }, 710);

    // Phase 3 (750ms): Line extends to full width
    setTimeout(function () {
        bootLine.style.transition = 'width 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)';
        bootLine.style.width = '95%';
    }, 750);

    // Phase 4 (1050ms): Vertical deflection kicks in — line expands into rectangle
    setTimeout(function () {
        bootLine.style.transition = 'width 0.2s ease, height 0.6s cubic-bezier(0.22, 0.61, 0.36, 1), background 0.4s ease, box-shadow 0.4s ease';
        bootLine.style.width = '100%';
        bootLine.style.height = '100%';
        bootLine.style.borderRadius = '0';
        bootLine.style.background = 'rgba(0, 255, 65, 0.08)';
        bootLine.style.boxShadow = '0 0 60px rgba(0, 255, 65, 0.15), inset 0 0 100px rgba(0, 255, 65, 0.05)';
    }, 1050);

    // Phase 5 (1500ms): Phosphor brightness overshoot flash
    setTimeout(function () {
        bootScreen.style.transition = 'background 0.12s ease';
        bootScreen.style.background = 'rgba(0, 255, 65, 0.2)';
    }, 1500);

    // Phase 5b (1620ms): Flash decays
    setTimeout(function () {
        bootScreen.style.transition = 'background 0.15s ease';
        bootScreen.style.background = 'rgba(0, 255, 65, 0.08)';
    }, 1620);

    // Phase 5c (1650ms): Source URL flashes in — terminal init style
    var bootSource = document.getElementById('boot-source');
    setTimeout(function () {
        if (bootSource) bootSource.classList.add('visible');
    }, 1650);

    // Phase 6 (1800ms): Overlay fades out to reveal scene
    setTimeout(function () {
        bootScreen.style.transition = 'opacity 0.4s ease-out';
        bootScreen.style.opacity = '0';
    }, 1800);

    // Phase 7 (2300ms): Cleanup — remove overlay, restore LED animation, enable hints
    setTimeout(function () {
        bootScreen.parentNode.removeChild(bootScreen);
        document.body.classList.remove('booting');
        powerLed.style.boxShadow = '';
        powerLed.style.animation = '';
        scheduleRedDot();
    }, 2300);

    // --- Text Shatter Effect ---
    var shatterState = { active: false, cooldown: false, chars: [], wasInText: false };

    (function initShatter() {
        var helloText = document.getElementById('hello-text');
        var els = helloText.querySelectorAll('.main-line, .bracket');
        for (var e = 0; e < els.length; e++) {
            var el = els[e];
            var text = el.textContent.trim();
            if (!text) continue;
            var frag = document.createDocumentFragment();
            for (var i = 0; i < text.length; i++) {
                var span = document.createElement('span');
                span.textContent = text[i];
                span.style.display = 'inline-block';
                frag.appendChild(span);
                shatterState.chars.push({ el: span, orig: text[i] });
            }
            el.textContent = '';
            el.appendChild(frag);
        }
    })();

    function triggerShatter(mx, my) {
        if (shatterState.active || shatterState.cooldown) return;
        if (document.body.classList.contains('booting')) return;
        shatterState.active = true;

        screenFlash('rgba(255, 255, 255, 0.25)', 80);
        addBurst(mx, my);
        if (canDrop()) {
            consumeDrop();
            dropStone(mx, my);
        }

        // Glitch the subtitle and typewriter on impact
        var subEl = document.getElementById('subtitle');
        subEl.style.transition = 'opacity 0.05s';
        subEl.style.opacity = '0.1';
        setTimeout(function () {
            subEl.style.opacity = '';
            setTimeout(function () {
                subEl.style.opacity = '0.15';
                setTimeout(function () {
                    subEl.style.transition = 'opacity 0.5s ease';
                    subEl.style.opacity = '';
                }, 80);
            }, 100);
        }, 100);
        typewriterEl.style.transition = 'opacity 0.05s';
        typewriterEl.style.opacity = '0';
        setTimeout(function () { typewriterEl.style.opacity = ''; typewriterEl.style.transition = ''; }, 200);

        var chars = shatterState.chars;
        var vels = [];

        for (var i = 0; i < chars.length; i++) {
            var rect = chars[i].el.getBoundingClientRect();
            var cx = rect.left + rect.width / 2;
            var cy = rect.top + rect.height / 2;
            var dx = cx - mx, dy = cy - my;
            var dist = Math.sqrt(dx * dx + dy * dy) || 1;
            var force = 100 + Math.random() * 250;
            vels.push({
                vx: (dx / dist) * force * (0.5 + Math.random()),
                vy: (dy / dist) * force * (0.5 + Math.random()) - 80,
                vr: (Math.random() - 0.5) * 720
            });
        }

        var t0 = performance.now();
        function animateScatter(now) {
            var t = Math.min(1, (now - t0) / 700);
            var e = 1 - Math.pow(1 - t, 3);

            for (var i = 0; i < chars.length; i++) {
                var v = vels[i];
                var x = v.vx * e;
                var y = v.vy * e + 250 * e * e;
                var r = v.vr * e;
                // Fade out fully — reaches 0 at ~75% through animation
                var o = Math.max(0, 1 - e * 1.35);
                chars[i].el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + r.toFixed(1) + 'deg)';
                chars[i].el.style.opacity = o.toFixed(2);
                if (t < 0.3) {
                    var glow = Math.round(15 * (1 - t / 0.3));
                    chars[i].el.style.textShadow = '0 0 ' + glow + 'px #00ff41, 0 0 ' + (glow * 2) + 'px rgba(0,255,65,0.5)';
                } else {
                    chars[i].el.style.textShadow = 'none';
                }
            }

            if (t < 1) requestAnimationFrame(animateScatter);
            else setTimeout(reassembleText, 700);
        }

        requestAnimationFrame(animateScatter);
    }

    function reassembleText() {
        var chars = shatterState.chars;
        var mChars = CONFIG.chars;
        var order = [];
        for (var i = 0; i < chars.length; i++) order.push(i);
        for (var i = order.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        }

        for (var n = 0; n < order.length; n++) {
            (function (idx, delay) {
                var c = chars[idx];
                var cyc = setInterval(function () {
                    c.el.textContent = mChars[Math.floor(Math.random() * mChars.length)];
                    c.el.style.color = '#00ff41';
                    c.el.style.textShadow = '0 0 8px #00ff41';
                }, 50);

                setTimeout(function () {
                    clearInterval(cyc);
                    c.el.textContent = c.orig;
                    c.el.style.color = '';
                    c.el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
                    c.el.style.transform = 'translate(0,0) rotate(0deg) scale(1)';
                    c.el.style.opacity = '1';

                    setTimeout(function () {
                        c.el.style.textShadow = '0 0 20px #00ff41, 0 0 40px #00ff41, 0 0 60px rgba(255,255,255,0.4)';
                        setTimeout(function () {
                            c.el.style.transition = 'text-shadow 0.8s ease-out';
                            c.el.style.textShadow = '';
                        }, 120);
                    }, 500);
                }, delay);
            })(order[n], n * 130 + Math.random() * 50);
        }

        setTimeout(function () {
            for (var i = 0; i < chars.length; i++) {
                chars[i].el.style.transition = '';
                chars[i].el.style.transform = '';
                chars[i].el.style.opacity = '';
                chars[i].el.style.color = '';
                chars[i].el.style.textShadow = '';
            }
            shatterState.active = false;
            shatterState.cooldown = true;
            setTimeout(function () { shatterState.cooldown = false; }, 3000);
        }, order.length * 180 + 1800);
    }

    document.addEventListener('mousemove', function (e) {
        if (eggSequence.active) return;
        if (shatterState.active || shatterState.cooldown) return;
        if (document.body.classList.contains('booting')) return;
        var rect = document.getElementById('hello-text').getBoundingClientRect();
        var pad = 15;
        var inText = e.clientX >= rect.left - pad && e.clientX <= rect.right + pad &&
                     e.clientY >= rect.top - pad && e.clientY <= rect.bottom + pad;
        if (inText && !shatterState.wasInText) triggerShatter(e.clientX, e.clientY);
        shatterState.wasInText = inText;
    });

    // --- Red Dot Easter Egg ---
    var redDot = {
        active: false,
        x: 0,
        y: 0,
        pulsePhase: 0,
        brightness: 0,
        fadeStart: 0,
        repositionTimer: null,
        delayTimer: null,
        enabled: true,
        hasTriggered: false,
        lockOnStart: 0,
        lockOnDuration: 2500
    };

    var eggSequence = {
        active: false,
        phase: 0,
        overlayCanvas: null,
        overlayCtx: null
    };

    function drawRedDot() {
        if (!redDot || !redDot.active || (eggSequence && eggSequence.active)) return;
        redDot.pulsePhase += CONFIG.redDotPulseSpeed;
        var elapsed = Date.now() - redDot.fadeStart;
        var fadeMult = Math.min(1.0, elapsed / CONFIG.redDotFadeInDuration);
        var pulse = (Math.sin(redDot.pulsePhase) + 1) * 0.5;
        var alpha = (CONFIG.redDotMinAlpha + pulse * (CONFIG.redDotMaxAlpha - CONFIG.redDotMinAlpha)) * fadeMult;
        redDot.brightness = alpha;

        rainCtx.save();
        rainCtx.globalCompositeOperation = 'lighter';

        // --- Lock-on animation (first 2.5s after appear/reposition) ---
        var lockElapsed = Date.now() - redDot.lockOnStart;
        var lockT = Math.min(1.0, lockElapsed / redDot.lockOnDuration);

        if (lockT < 1.0) {
            var lockAlpha = alpha * (1.0 - lockT * 0.7);

            // Contracting ring 1: 80px → 12px
            var ringRadius = 80 - lockT * 68;
            rainCtx.strokeStyle = 'rgba(255, 30, 30, ' + (lockAlpha * 0.6).toFixed(3) + ')';
            rainCtx.lineWidth = 2 - lockT * 1.2;
            rainCtx.beginPath();
            rainCtx.arc(redDot.x, redDot.y, ringRadius, 0, Math.PI * 2);
            rainCtx.stroke();

            // Contracting ring 2 (delayed): 50px → 12px
            if (lockT > 0.2) {
                var ring2T = (lockT - 0.2) / 0.8;
                var ring2Radius = 50 - ring2T * 38;
                rainCtx.strokeStyle = 'rgba(255, 30, 30, ' + (lockAlpha * 0.4 * (1 - ring2T)).toFixed(3) + ')';
                rainCtx.lineWidth = 1.5 - ring2T;
                rainCtx.beginPath();
                rainCtx.arc(redDot.x, redDot.y, ring2Radius, 0, Math.PI * 2);
                rainCtx.stroke();
            }

            // Cardinal crosshair ticks sliding inward
            var tickOuter = 40 - lockT * 25;
            var tickInner = tickOuter - 8;
            var tickAlpha = lockAlpha * 0.7;
            rainCtx.strokeStyle = 'rgba(255, 30, 30, ' + tickAlpha.toFixed(3) + ')';
            rainCtx.lineWidth = 1.5;
            // Top
            rainCtx.beginPath();
            rainCtx.moveTo(redDot.x, redDot.y - tickOuter);
            rainCtx.lineTo(redDot.x, redDot.y - tickInner);
            rainCtx.stroke();
            // Bottom
            rainCtx.beginPath();
            rainCtx.moveTo(redDot.x, redDot.y + tickInner);
            rainCtx.lineTo(redDot.x, redDot.y + tickOuter);
            rainCtx.stroke();
            // Left
            rainCtx.beginPath();
            rainCtx.moveTo(redDot.x - tickOuter, redDot.y);
            rainCtx.lineTo(redDot.x - tickInner, redDot.y);
            rainCtx.stroke();
            // Right
            rainCtx.beginPath();
            rainCtx.moveTo(redDot.x + tickInner, redDot.y);
            rainCtx.lineTo(redDot.x + tickOuter, redDot.y);
            rainCtx.stroke();

            // Rotating diagonal ticks (spin 270 degrees while contracting)
            var spinAngle = lockT * Math.PI * 1.5;
            var diagDist = 30 - lockT * 16;
            var diagLen = 6;
            rainCtx.strokeStyle = 'rgba(255, 30, 30, ' + (tickAlpha * 0.5).toFixed(3) + ')';
            rainCtx.lineWidth = 1;
            for (var d = 0; d < 4; d++) {
                var dAngle = spinAngle + d * Math.PI / 2 + Math.PI / 4;
                var dCos = Math.cos(dAngle);
                var dSin = Math.sin(dAngle);
                rainCtx.beginPath();
                rainCtx.moveTo(redDot.x + dCos * (diagDist - diagLen), redDot.y + dSin * (diagDist - diagLen));
                rainCtx.lineTo(redDot.x + dCos * diagDist, redDot.y + dSin * diagDist);
                rainCtx.stroke();
            }
        }

        // --- Normal pulsing red dot (always drawn) ---
        var gradient = rainCtx.createRadialGradient(
            redDot.x, redDot.y, 0,
            redDot.x, redDot.y, CONFIG.redDotRadius * 4
        );
        gradient.addColorStop(0, 'rgba(255, 30, 30, ' + (alpha * 0.8).toFixed(3) + ')');
        gradient.addColorStop(0.3, 'rgba(255, 0, 0, ' + (alpha * 0.4).toFixed(3) + ')');
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        rainCtx.fillStyle = gradient;
        rainCtx.beginPath();
        rainCtx.arc(redDot.x, redDot.y, CONFIG.redDotRadius * 4, 0, Math.PI * 2);
        rainCtx.fill();
        rainCtx.fillStyle = 'rgba(255, 60, 60, ' + alpha.toFixed(3) + ')';
        rainCtx.beginPath();
        rainCtx.arc(redDot.x, redDot.y, CONFIG.redDotRadius, 0, Math.PI * 2);
        rainCtx.fill();
        rainCtx.restore();
    }

    function positionRedDot() {
        // Avoid placing dot behind the text overlay (unclickable zone)
        var helloEl = document.getElementById('hello-text');
        var textRect = helloEl ? helloEl.getBoundingClientRect() : null;
        var pad = 50; // extra padding around text zone
        var attempts = 0;

        do {
            var margin = Math.floor(columns * 0.1);
            var col = margin + Math.floor(Math.random() * (columns - margin * 2));
            redDot.x = col * CONFIG.fontSize + CONFIG.fontSize / 2;
            var yMargin = rainCanvas.height * 0.2;
            redDot.y = yMargin + Math.random() * (rainCanvas.height - yMargin * 2);
            attempts++;
            // Check if dot lands inside the text exclusion zone
            var inText = textRect &&
                redDot.x >= textRect.left - pad && redDot.x <= textRect.right + pad &&
                redDot.y >= textRect.top - pad && redDot.y <= textRect.bottom + pad;
        } while (inText && attempts < 20);
    }

    function startRedDot() {
        if (!redDot.enabled) return;
        positionRedDot();
        redDot.active = true;
        redDot.fadeStart = Date.now();
        redDot.lockOnStart = Date.now();
        redDot.pulsePhase = Math.random() * Math.PI * 2;
        redDot.repositionTimer = setInterval(function () {
            positionRedDot();
            redDot.fadeStart = Date.now();
            redDot.lockOnStart = Date.now();
            redDot.pulsePhase = Math.random() * Math.PI * 2;
        }, CONFIG.redDotRepositionInterval);
    }

    function stopRedDot() {
        redDot.active = false;
        if (redDot.repositionTimer) {
            clearInterval(redDot.repositionTimer);
            redDot.repositionTimer = null;
        }
        if (redDot.delayTimer) {
            clearTimeout(redDot.delayTimer);
            redDot.delayTimer = null;
        }
    }

    function scheduleRedDot() {
        if (redDot.hasTriggered) return;
        stopRedDot();
        redDot.enabled = true;
        redDot.delayTimer = setTimeout(startRedDot, CONFIG.redDotDelay);
    }

    // --- Easter Egg Sequence ---
    function triggerEggSequence() {
        if (eggSequence.active) return;
        eggSequence.active = true;
        eggSequence.phase = 0;
        eggSequence.impactX = redDot.x;
        eggSequence.impactY = redDot.y;
        redDot.hasTriggered = true;
        stopRedDot();

        var overlay = document.createElement('canvas');
        overlay.width = window.innerWidth;
        overlay.height = window.innerHeight;
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:998;pointer-events:none;';
        document.body.appendChild(overlay);
        eggSequence.overlayCanvas = overlay;
        eggSequence.overlayCtx = overlay.getContext('2d');

        eggPhaseBreakApart();
    }

    function eggPhaseBreakApart() {
        eggSequence.phase = 1;
        var ctx = eggSequence.overlayCtx;
        var canvas = eggSequence.overlayCanvas;
        var w = canvas.width;
        var h = canvas.height;
        var impactX = eggSequence.impactX;
        var impactY = eggSequence.impactY;

        // Capture current screen
        renderer.render(scene, camera);
        var captureCanvas = document.createElement('canvas');
        captureCanvas.width = w;
        captureCanvas.height = h;
        var captureCtx = captureCanvas.getContext('2d');
        captureCtx.drawImage(renderer.domElement, 0, 0, w, h);

        sceneEl.style.opacity = '0';
        var overlayEl = document.getElementById('overlay');
        overlayEl.style.opacity = '0';

        // === Start map flying IMMEDIATELY behind the overlay ===
        var lat = 0, lng = 0;
        if (geoData.loc) {
            var geoParts = geoData.loc.split(',');
            lat = parseFloat(geoParts[0]) || 0;
            lng = parseFloat(geoParts[1]) || 0;
        }

        // Pre-generate search waypoints for frame-by-frame map control
        var wrongLat1 = lat + (Math.random() - 0.5) * 0.3;
        var wrongLng1 = lng + (Math.random() - 0.5) * 0.4;
        var wrongLat2 = lat + (Math.random() - 0.5) * 0.12;
        var wrongLng2 = lng + (Math.random() - 0.5) * 0.18;
        var startLat = wrongLat1 + (Math.random() - 0.5) * 0.08;
        var startLng = wrongLng1 + (Math.random() - 0.5) * 0.1;
        var jerkLat1 = wrongLat1 + (Math.random() > 0.5 ? 1 : -1) * (0.03 + Math.random() * 0.04);
        var jerkLng1 = wrongLng1 + (Math.random() > 0.5 ? 1 : -1) * (0.04 + Math.random() * 0.05);
        var jerkLat2 = wrongLat2 + (Math.random() > 0.5 ? 1 : -1) * (0.02 + Math.random() * 0.03);
        var jerkLng2 = wrongLng2 + (Math.random() > 0.5 ? 1 : -1) * (0.03 + Math.random() * 0.04);

        var useMapbox = typeof mapboxgl !== 'undefined' && CONFIG.mapboxToken;
        var map = null, mapDiv = null;

        if (useMapbox) {
            if (preloadedMap && preloadedMapReady) {
                map = preloadedMap;
                mapDiv = preloadedMapDiv;
                mapDiv.id = 'egg-map';
                mapDiv.style.zIndex = '997';
                mapDiv.style.opacity = '0';
                mapDiv.style.transition = 'opacity 0.3s ease-in';
                mapDiv.style.pointerEvents = 'none';
                preloadedMap = null;
                preloadedMapDiv = null;
                preloadedMapReady = false;
            } else {
                mapDiv = document.createElement('div');
                mapDiv.id = 'egg-map';
                mapDiv.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:997;filter:saturate(0.4) brightness(0.7) hue-rotate(90deg);opacity:0;transition:opacity 0.3s ease-in;';
                document.body.appendChild(mapDiv);
                mapboxgl.accessToken = CONFIG.mapboxToken;
                map = new mapboxgl.Map({
                    container: 'egg-map',
                    style: 'mapbox://styles/mapbox/satellite-streets-v12',
                    center: [startLng, startLat], zoom: 4,
                    interactive: false, attributionControl: false,
                    fadeDuration: 0, pitchWithRotate: false, preserveDrawingBuffer: true
                });
            }
            canvas.style.zIndex = '998';

            // Set preloaded map to starting search position
            try {
                map.jumpTo({ center: [startLng, startLat], zoom: 4, pitch: 0, bearing: 0 });
            } catch (e) {}

            // Store on eggSequence for HUD phase
            eggSequence.map = map;
            eggSequence.mapDiv = mapDiv;
            eggSequence.mapLat = lat;
            eggSequence.mapLng = lng;
            eggSequence.searchGeo = {
                start:  { lat: startLat, lng: startLng },
                wrong1: { lat: wrongLat1, lng: wrongLng1 },
                wrong2: { lat: wrongLat2, lng: wrongLng2 },
                jerk1:  { lat: jerkLat1, lng: jerkLng1 },
                jerk2:  { lat: jerkLat2, lng: jerkLng2 },
                real:   { lat: lat, lng: lng }
            };
        }

        // --- Generate irregular fragments (adaptive grid) ---
        var baseCols = 16;
        var baseRows = 12;
        var cellW = Math.ceil(w / baseCols);
        var cellH = Math.ceil(h / baseRows);
        var maxDist = Math.sqrt(w * w + h * h);

        // Track which cells are claimed
        var claimed = [];
        for (var ci = 0; ci < baseRows; ci++) {
            claimed[ci] = [];
            for (var cj = 0; cj < baseCols; cj++) {
                claimed[ci][cj] = false;
            }
        }

        var fragments = [];

        for (var r = 0; r < baseRows; r++) {
            for (var c = 0; c < baseCols; c++) {
                if (claimed[r][c]) continue;

                var fx = c * cellW;
                var fy = r * cellH;
                var centerX = fx + cellW / 2;
                var centerY = fy + cellH / 2;
                var dist = Math.sqrt(
                    (centerX - impactX) * (centerX - impactX) +
                    (centerY - impactY) * (centerY - impactY)
                );
                var normDist = dist / maxDist;

                // Merge size: near impact = small, far = large chunks
                var mergeSize = 1;
                if (normDist > 0.35) mergeSize = 2;
                if (normDist > 0.55) mergeSize = 3;
                if (Math.random() < 0.3) mergeSize = Math.max(1, mergeSize - 1);
                if (Math.random() < 0.15) mergeSize = Math.min(4, mergeSize + 1);

                // Clamp to grid boundaries and unclaimed cells
                var actualMergeC = 1;
                var actualMergeR = 1;
                for (var mc = 1; mc <= mergeSize && c + mc <= baseCols; mc++) {
                    for (var mr = 1; mr <= mergeSize && r + mr <= baseRows; mr++) {
                        var allFree = true;
                        for (var cr = r; cr < r + mr && allFree; cr++) {
                            for (var cc = c; cc < c + mc && allFree; cc++) {
                                if (claimed[cr][cc]) allFree = false;
                            }
                        }
                        if (allFree) { actualMergeC = mc; actualMergeR = mr; }
                    }
                }

                // Claim cells
                for (var cr2 = r; cr2 < r + actualMergeR; cr2++) {
                    for (var cc2 = c; cc2 < c + actualMergeC; cc2++) {
                        claimed[cr2][cc2] = true;
                    }
                }

                var fragW = actualMergeC * cellW;
                var fragH = actualMergeR * cellH;
                var fragCX = fx + fragW / 2;
                var fragCY = fy + fragH / 2;

                // Direction away from impact point
                var dx = fragCX - impactX;
                var dy = fragCY - impactY;
                var fragDist = Math.sqrt(dx * dx + dy * dy) || 1;

                // Near fragments fly faster
                var speedMult = 1.5 + (1.0 - normDist) * 5.0 + Math.random() * 2.0;

                fragments.push({
                    sx: fx, sy: fy, sw: fragW, sh: fragH,
                    vx: (dx / fragDist) * speedMult,
                    vy: (dy / fragDist) * speedMult,
                    rotation: 0,
                    rotVel: (Math.random() - 0.5) * 0.08 * (1.5 - normDist),
                    delay: normDist * 0.15
                });
            }
        }

        // --- Pre-generate crack lines radiating from impact ---
        var cracks = [];
        var crackCount = 8 + Math.floor(Math.random() * 5);
        for (var cki = 0; cki < crackCount; cki++) {
            var angle = (cki / crackCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            var length = 60 + Math.random() * 180;
            var segments = [];
            var crX = impactX;
            var crY = impactY;
            var segCount = 4 + Math.floor(Math.random() * 4);
            for (var s = 0; s < segCount; s++) {
                var segLen = length / segCount;
                angle += (Math.random() - 0.5) * 0.6;
                crX += Math.cos(angle) * segLen;
                crY += Math.sin(angle) * segLen;
                segments.push({ x: crX, y: crY });
            }
            cracks.push(segments);
        }

        screenFlash('rgba(255, 255, 255, 0.6)', 150);

        var t0 = performance.now();
        var crackDuration = 200;
        var duration = CONFIG.eggBreakDuration;
        var mapFadedIn = false;

        function animateBreak(now) {
            var totalT = Math.min(1, (now - t0) / duration);
            var crackT = Math.min(1, (now - t0) / crackDuration);

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(0, 0, 0, ' + (totalT * 0.8).toFixed(2) + ')';
            ctx.fillRect(0, 0, w, h);

            // --- Fade in map behind fragments at 30% break progress ---
            if (!mapFadedIn && totalT > 0.3 && mapDiv) {
                mapDiv.style.opacity = '1';
                mapFadedIn = true;
            }

            // --- Impact flash glow ---
            if (totalT < 0.15) {
                var flashT = totalT / 0.15;
                var flashAlpha = (1 - flashT) * 0.6;
                var flashGrad = ctx.createRadialGradient(impactX, impactY, 0, impactX, impactY, 120);
                flashGrad.addColorStop(0, 'rgba(255, 200, 200, ' + flashAlpha.toFixed(3) + ')');
                flashGrad.addColorStop(0.3, 'rgba(255, 100, 100, ' + (flashAlpha * 0.5).toFixed(3) + ')');
                flashGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
                ctx.fillStyle = flashGrad;
                ctx.beginPath();
                ctx.arc(impactX, impactY, 120, 0, Math.PI * 2);
                ctx.fill();
            }

            // --- Crack lines (first 200ms, then fade) ---
            if (crackT < 1) {
                var crackAlpha = 0.7 * (1 - crackT);
                ctx.strokeStyle = 'rgba(255, 255, 255, ' + crackAlpha.toFixed(3) + ')';
                ctx.lineWidth = 2 - crackT;
                for (var cki2 = 0; cki2 < cracks.length; cki2++) {
                    var segs = cracks[cki2];
                    var visibleSegs = Math.floor(crackT * segs.length * 3);
                    ctx.beginPath();
                    ctx.moveTo(impactX, impactY);
                    for (var s2 = 0; s2 < Math.min(visibleSegs, segs.length); s2++) {
                        ctx.lineTo(segs[s2].x, segs[s2].y);
                    }
                    ctx.stroke();
                }
            }

            // --- Fragments ---
            for (var i = 0; i < fragments.length; i++) {
                var frag = fragments[i];
                var fragT = Math.max(0, totalT - frag.delay);
                if (fragT <= 0) {
                    // Still stationary
                    ctx.drawImage(captureCanvas,
                        frag.sx, frag.sy, frag.sw, frag.sh,
                        frag.sx, frag.sy, frag.sw, frag.sh
                    );
                    continue;
                }
                var ease = fragT * fragT;
                var px = frag.sx + frag.vx * ease * 120;
                var py = frag.sy + frag.vy * ease * 120;
                var sc = 1 + ease * 1.5;
                var op = Math.max(0, 1 - fragT * 1.5);
                var rot = frag.rotation + frag.rotVel * ease * 100;

                ctx.save();
                ctx.globalAlpha = op;
                ctx.translate(px + frag.sw / 2, py + frag.sh / 2);
                ctx.rotate(rot);
                ctx.scale(sc, sc);
                ctx.drawImage(captureCanvas,
                    frag.sx, frag.sy, frag.sw, frag.sh,
                    -frag.sw / 2, -frag.sh / 2, frag.sw, frag.sh
                );
                ctx.restore();
            }

            // Noise scanlines
            if (Math.random() < 0.3) {
                var noiseY = Math.random() * h;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.fillRect(0, noiseY, w, 2 + Math.random() * 4);
            }

            if (totalT < 1) {
                requestAnimationFrame(animateBreak);
            } else {
                // Map is already flying — go straight to HUD or fallback
                if (useMapbox && map) {
                    eggPhaseMapHud();
                } else {
                    eggPhaseMapZoomFallback();
                }
            }
        }
        requestAnimationFrame(animateBreak);
    }

    // ====== SHARED ERROR NOTIFICATION (during SIGNAL LOST phases) ======
    var sharedErrCodes = ['ERR_0x7F: TRACE CORRELATION FAILED', 'ERR_0x3A: NODE HANDSHAKE TIMEOUT',
        'ERR_0xB2: SIGNAL DESYNC DETECTED', 'ERR_0x51: CARRIER PHASE DRIFT'];
    var sharedErrMsg1 = sharedErrCodes[Math.floor(Math.random() * sharedErrCodes.length)];
    var sharedErrMsg2 = sharedErrCodes[Math.floor(Math.random() * sharedErrCodes.length)];

    function drawSignalLostOverlay(ctx, w, h, t, now) {
        var isLost1 = t >= 0.25 && t < 0.37;
        var isLost2 = t >= 0.54 && t < 0.66;
        if (!isLost1 && !isLost2) return;

        var localT = isLost1 ? (t - 0.25) / 0.12 : (t - 0.54) / 0.12;
        var errText = isLost1 ? sharedErrMsg1 : sharedErrMsg2;
        var cx = w / 2;
        var cy = h / 2;

        ctx.save();

        // Red screen flash (strongest at start, fades)
        var flashAlpha = Math.max(0, 0.15 * (1 - localT * 1.5));
        if (flashAlpha > 0) {
            ctx.fillStyle = 'rgba(255, 0, 0, ' + flashAlpha.toFixed(3) + ')';
            ctx.fillRect(0, 0, w, h);
        }

        // Horizontal static noise bands
        var noiseBands = 3 + Math.floor(Math.random() * 4);
        for (var nb = 0; nb < noiseBands; nb++) {
            var bandY = Math.random() * h;
            var bandH = 1 + Math.random() * 3;
            var bandAlpha = 0.08 + Math.random() * 0.12;
            ctx.fillStyle = 'rgba(255, 30, 30, ' + bandAlpha.toFixed(3) + ')';
            ctx.fillRect(0, bandY, w, bandH);
        }

        // Warning bar — centered, pulsing, tall
        var barAlpha = 0.6 + Math.sin(now * 0.025) * 0.3;
        var barH = 64;
        var barY = cy - 110;
        ctx.fillStyle = 'rgba(80, 0, 0, ' + (barAlpha * 0.55).toFixed(3) + ')';
        ctx.fillRect(0, barY, w, barH);

        // Warning bar border lines (thicker)
        ctx.strokeStyle = 'rgba(255, 40, 40, ' + (barAlpha * 0.7).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, barY); ctx.lineTo(w, barY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, barY + barH); ctx.lineTo(w, barY + barH); ctx.stroke();

        // Primary warning text — large, typewriter reveal
        var warnLabel = '!! WARNING: SIGNAL INTERRUPTED !!';
        var warnReveal = Math.min(warnLabel.length, Math.floor(localT * warnLabel.length * 3));
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 60, 60, ' + barAlpha.toFixed(3) + ')';
        ctx.fillText(warnLabel.substring(0, warnReveal), cx, barY + 28);

        // Error code line — slightly smaller, below
        var errReveal = Math.min(errText.length, Math.max(0, Math.floor((localT - 0.3) * errText.length * 3)));
        if (errReveal > 0) {
            ctx.font = '16px monospace';
            ctx.fillStyle = 'rgba(255, 100, 100, ' + (barAlpha * 0.8).toFixed(3) + ')';
            ctx.fillText(errText.substring(0, errReveal), cx, barY + 52);
        }

        // Secondary status line below bar
        var statusText = localT < 0.5 ? 'RECALIBRATING SIGNAL...' : 'REROUTING TRACE NODES...';
        ctx.font = '14px monospace';
        ctx.fillStyle = 'rgba(255, 100, 100, ' + (barAlpha * 0.5).toFixed(3) + ')';
        ctx.fillText(statusText, cx, barY + barH + 22);

        // Flashing triangular warning icons on each side of bar
        var triAlpha = Math.sin(now * 0.04) > 0 ? barAlpha * 0.7 : barAlpha * 0.2;
        ctx.fillStyle = 'rgba(255, 50, 50, ' + triAlpha.toFixed(3) + ')';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('\u26A0', 12, barY + 32);
        ctx.textAlign = 'right';
        ctx.fillText('\u26A0', w - 12, barY + 32);

        ctx.restore();
    }

    // ====== SHARED SURVEILLANCE HUD (callout panel + leader line) ======
    function drawSurveillanceHud(ctx, w, h, rx, ry, t, now, trackLines, displayZoom, lat, lng, searchState) {
        // --- Responsive panel positioning ---
        var panelRight = w > 600;
        ctx.font = '13px monospace';
        var maxTextW = 0;
        for (var mi = 0; mi < trackLines.length; mi++) {
            var tw = ctx.measureText('> ' + trackLines[mi]).width;
            if (tw > maxTextW) maxTextW = tw;
        }
        var panelW = Math.min(Math.max(300, maxTextW + 30), w - 40);
        var panelH = 130;
        var panelX, panelY;
        if (panelRight) {
            panelX = rx + 90;
            panelY = ry + 65;
            // Clamp to viewport
            if (panelX + panelW > w - 10) panelX = rx - 90 - panelW;
            if (panelY + panelH > h - 10) panelY = h - panelH - 10;
        } else {
            panelX = Math.max(10, rx - panelW / 2);
            panelY = ry + 85;
            if (panelY + panelH > h - 10) panelY = h - panelH - 10;
        }

        // --- Panel fade-in ---
        var panelAlpha = Math.min(1, t / 0.12);
        if (panelAlpha <= 0) return;

        ctx.save();
        ctx.globalAlpha = panelAlpha;

        // --- Leader line (L-shaped elbow from reticle to panel) ---
        var drawT = Math.min(1, t / 0.15);
        if (drawT > 0) {
            var leaderStartX = rx + 42;
            var leaderStartY = ry + 42;
            var elbowX = panelX;
            var elbowY = leaderStartY;
            var endX = panelX;
            var endY = panelY;

            ctx.strokeStyle = 'rgba(0, 255, 65, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();

            // Total path length for animation
            var seg1Len = Math.abs(elbowX - leaderStartX);
            var seg2Len = Math.abs(endY - elbowY);
            var totalLen = seg1Len + seg2Len;
            var drawnLen = drawT * totalLen;

            ctx.moveTo(leaderStartX, leaderStartY);
            if (drawnLen <= seg1Len) {
                // Still drawing horizontal segment
                var hProgress = drawnLen / seg1Len;
                ctx.lineTo(leaderStartX + (elbowX - leaderStartX) * hProgress, leaderStartY);
            } else {
                // Horizontal complete, drawing vertical
                ctx.lineTo(elbowX, elbowY);
                var vProgress = (drawnLen - seg1Len) / seg2Len;
                ctx.lineTo(endX, elbowY + (endY - elbowY) * vProgress);
            }
            ctx.stroke();

            // Diamond anchor at start point
            ctx.fillStyle = 'rgba(0, 255, 65, 0.6)';
            ctx.beginPath();
            ctx.moveTo(leaderStartX, leaderStartY - 4);
            ctx.lineTo(leaderStartX + 4, leaderStartY);
            ctx.lineTo(leaderStartX, leaderStartY + 4);
            ctx.lineTo(leaderStartX - 4, leaderStartY);
            ctx.closePath();
            ctx.fill();
        }

        // --- Panel background ---
        var borderAlpha = 0.25 + Math.sin(now * 0.004) * 0.08;
        ctx.fillStyle = 'rgba(0, 12, 0, 0.55)';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.strokeStyle = 'rgba(0, 255, 65, ' + borderAlpha.toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX, panelY, panelW, panelH);

        // --- Header label (above panel) ---
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0, 255, 65, 0.45)';
        ctx.fillText('// GEOLOCATION TRACE //', panelX + 2, panelY - 8);

        // --- Track lines with typewriter + scramble ---
        ctx.font = '13px monospace';
        var lineY = panelY + 22;
        var lineProgress = t * trackLines.length;
        for (var li = 0; li < trackLines.length; li++) {
            if (li > lineProgress) break;
            var lineT = Math.min(1, lineProgress - li);
            var visibleChars = Math.floor(lineT * trackLines[li].length);
            var displayText = trackLines[li].substring(0, visibleChars);
            var scrambleLen = Math.min(4, trackLines[li].length - visibleChars);
            for (var si = 0; si < scrambleLen; si++) {
                displayText += CONFIG.chars[Math.floor(Math.random() * CONFIG.chars.length)];
            }
            ctx.fillStyle = li === trackLines.length - 1 ? '#ff3030' : '#00ff41';
            ctx.globalAlpha = panelAlpha * 0.9;
            ctx.fillText('> ' + displayText, panelX + 12, lineY + li * 22);
        }

        // --- Separator line ---
        var sepY = lineY + trackLines.length * 22 + 2;
        ctx.strokeStyle = 'rgba(0, 255, 65, 0.15)';
        ctx.beginPath();
        ctx.moveTo(panelX + 12, sepY);
        ctx.lineTo(panelX + panelW - 12, sepY);
        ctx.stroke();

        // --- Status bar ---
        ctx.font = '10px monospace';
        ctx.globalAlpha = panelAlpha * 0.5;
        var statusY = sepY + 16;
        ctx.fillStyle = '#00ff41';
        ctx.textAlign = 'left';
        ctx.fillText('ZOOM: ' + displayZoom.toFixed(1) + 'x', panelX + 12, statusY);
        ctx.textAlign = 'center';
        var sigVal = 60 + Math.floor(t * 35) + Math.floor(Math.random() * 5);
        ctx.fillText('SIG: ' + sigVal + '%', panelX + panelW / 2, statusY);
        ctx.textAlign = 'right';
        var resMeters = displayZoom > 0 ? (40000000 / Math.pow(2, displayZoom)).toFixed(1) : '?';
        ctx.fillText('RES: ' + resMeters + 'm', panelX + panelW - 12, statusY);

        // --- Search state indicator ---
        if (searchState) {
            var stateColor, stateAlpha;
            if (searchState === 'SIGNAL LOST') {
                stateColor = '#ff3030';
                stateAlpha = 0.7 + Math.sin(now * 0.03) * 0.3;
            } else if (searchState === 'LOCKED') {
                stateColor = '#00ff41';
                stateAlpha = 0.9;
            } else if (searchState === 'ACQUIRING') {
                stateColor = '#ffaa00';
                stateAlpha = 0.6 + Math.sin(now * 0.015) * 0.3;
            } else {
                stateColor = '#00ff41';
                stateAlpha = 0.4 + Math.sin(now * 0.01) * 0.15;
            }
            ctx.font = '11px monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = stateColor;
            ctx.globalAlpha = panelAlpha * stateAlpha;
            ctx.fillText('[' + searchState + ']', panelX + panelW - 4, panelY - 8);
        }

        ctx.restore();

        // --- Bottom-left coords (dimmed, stays in place) ---
        ctx.save();
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#00ff41';
        ctx.globalAlpha = 0.4;
        ctx.fillText('LAT: ' + lat.toFixed(6) + '  LNG: ' + lng.toFixed(6), 20, h - 30);
        ctx.restore();
    }

    // ====== MAP HUD (map already flying — just draw surveillance overlay) ======
    function eggPhaseMapHud() {
        eggSequence.phase = 2;
        var ctx = eggSequence.overlayCtx;
        var canvas = eggSequence.overlayCanvas;
        var w = canvas.width;
        var h = canvas.height;
        var map = eggSequence.map;
        var mapDiv = eggSequence.mapDiv;
        var lat = eggSequence.mapLat;
        var lng = eggSequence.mapLng;

        var cityName = geoData.city ? geoData.city.toUpperCase() : 'UNKNOWN';
        var regionName = geoData.region ? geoData.region.toUpperCase() : '';
        var countryCode = geoData.country || '??';

        var trackLines = [
            'INITIATING TRACE...',
            'TARGET: ' + lat.toFixed(4) + ', ' + lng.toFixed(4),
            'LOCATION: ' + cityName + (regionName ? ', ' + regionName : '') + ' // ' + countryCode,
            'SIGNAL LOCKED'
        ];

        var flyDone = false;
        var hudT0 = performance.now();
        var duration = CONFIG.eggMapDuration;
        var hudRaf = null;

        // --- Frame-by-frame geographic search trajectory ---
        // Map follows reticle: jumpTo each frame instead of flyTo chain
        // Timeline (normalized t over 11s):
        //   0.00-0.18  SCANNING     — drift start → wrong1, zoom 4→8
        //   0.18-0.25  ACQUIRING    — hover near wrong1, zoom 8→9
        //   0.25-0.28  SIGNAL LOST  — jerk to jerk1, zoom 9→7 (pullback!)
        //   0.28-0.43  REACQUIRING  — jerk1 → wrong2, zoom 7→11
        //   0.43-0.50  ACQUIRING    — hover near wrong2, zoom 11→12
        //   0.50-0.53  SIGNAL LOST  — jerk to jerk2, zoom 12→10 (pullback!)
        //   0.53-0.65  CONVERGING   — jerk2 → real, zoom 10→16
        //   0.65-1.00  LOCKED       — hold real, zoom 16→18
        var sg = eggSequence.searchGeo;
        var jerkBearing1 = (Math.random() > 0.5 ? 1 : -1) * 25;
        var jerkBearing2 = (Math.random() > 0.5 ? 1 : -1) * 20;

        // Timeline (normalized t):
        //   0.00-0.18  SCANNING     — start → wrong1, zoom 4→8
        //   0.18-0.25  ACQUIRING    — hover wrong1, zoom 8→9
        //   0.25-0.37  SIGNAL LOST  — jerk to jerk1, zoom 9→7 (pullback + error)
        //   0.37-0.47  REACQUIRING  — jerk1 → wrong2, zoom 7→11
        //   0.47-0.54  ACQUIRING    — hover wrong2, zoom 11→12
        //   0.54-0.66  SIGNAL LOST  — jerk to jerk2, zoom 12→10 (pullback + error)
        //   0.66-0.76  CONVERGING   — jerk2 → real, zoom 10→16
        //   0.76-1.00  LOCKED       — hold real, zoom 16→18

        function getSearchGeo(t) {
            var sLat, sLng, sZoom, sPitch, sBearing;
            if (t < 0.18) {
                // SCANNING: drift from start toward wrong1
                var st = t / 0.18;
                var ease = st * st * (3 - 2 * st);
                sLat = sg.start.lat + (sg.wrong1.lat - sg.start.lat) * ease;
                sLng = sg.start.lng + (sg.wrong1.lng - sg.start.lng) * ease;
                sZoom = 4 + 4 * ease;
                sPitch = 20 * ease;
                sBearing = 15 * ease;
            } else if (t < 0.25) {
                // ACQUIRING: oscillate near wrong1
                var st2 = (t - 0.18) / 0.07;
                sLat = sg.wrong1.lat + Math.sin(st2 * 6) * 0.002;
                sLng = sg.wrong1.lng + Math.cos(st2 * 8) * 0.003;
                sZoom = 8 + st2;
                sPitch = 20 + st2 * 5;
                sBearing = 15 + Math.sin(st2 * 4) * 3;
            } else if (t < 0.37) {
                // SIGNAL LOST 1: jerk away, zoom PULLS BACK
                var jt = (t - 0.25) / 0.12;
                var jEase = jt < 0.15 ? jt / 0.15 : 1;
                sLat = sg.wrong1.lat + (sg.jerk1.lat - sg.wrong1.lat) * jEase;
                sLng = sg.wrong1.lng + (sg.jerk1.lng - sg.wrong1.lng) * jEase;
                sZoom = 9 - 2 * jEase;
                sPitch = 25 - 15 * jEase;
                sBearing = 15 + jerkBearing1 * jEase;
            } else if (t < 0.47) {
                // REACQUIRING: drift from jerk1 to wrong2
                var st3 = (t - 0.37) / 0.10;
                var ease3 = st3 * st3 * (3 - 2 * st3);
                sLat = sg.jerk1.lat + (sg.wrong2.lat - sg.jerk1.lat) * ease3;
                sLng = sg.jerk1.lng + (sg.wrong2.lng - sg.jerk1.lng) * ease3;
                sZoom = 7 + 4 * ease3;
                sPitch = 10 + 25 * ease3;
                sBearing = -10 * ease3;
            } else if (t < 0.54) {
                // ACQUIRING 2: oscillate near wrong2
                var st4 = (t - 0.47) / 0.07;
                sLat = sg.wrong2.lat + Math.sin(st4 * 7) * 0.0015;
                sLng = sg.wrong2.lng + Math.cos(st4 * 9) * 0.002;
                sZoom = 11 + st4;
                sPitch = 35 + st4 * 5;
                sBearing = -10 + Math.sin(st4 * 5) * 2;
            } else if (t < 0.66) {
                // SIGNAL LOST 2: jerk away, zoom PULLS BACK
                var jt2 = (t - 0.54) / 0.12;
                var jEase2 = jt2 < 0.15 ? jt2 / 0.15 : 1;
                sLat = sg.wrong2.lat + (sg.jerk2.lat - sg.wrong2.lat) * jEase2;
                sLng = sg.wrong2.lng + (sg.jerk2.lng - sg.wrong2.lng) * jEase2;
                sZoom = 12 - 2 * jEase2;
                sPitch = 40 - 20 * jEase2;
                sBearing = -10 + jerkBearing2 * jEase2;
            } else if (t < 0.76) {
                // CONVERGING: final drift to real target
                var st5 = (t - 0.66) / 0.10;
                var ease5 = st5 * st5 * (3 - 2 * st5);
                sLat = sg.jerk2.lat + (sg.real.lat - sg.jerk2.lat) * ease5;
                sLng = sg.jerk2.lng + (sg.real.lng - sg.jerk2.lng) * ease5;
                sZoom = 10 + 6 * ease5;
                sPitch = 20 + 35 * ease5;
                sBearing = -20 * ease5;
            } else {
                // LOCKED: hold at real, slow zoom to max
                var st6 = (t - 0.76) / 0.24;
                var ease6 = st6 * st6 * (3 - 2 * st6);
                sLat = sg.real.lat;
                sLng = sg.real.lng;
                sZoom = 16 + 2 * ease6;
                sPitch = 55 + 5 * ease6;
                sBearing = -20;
            }
            return { lat: sLat, lng: sLng, zoom: sZoom, pitch: sPitch, bearing: sBearing };
        }

        // Search state for HUD status indicator
        function getSearchState(t) {
            if (t < 0.18) return 'SCANNING';
            if (t < 0.25) return 'ACQUIRING';
            if (t < 0.37) return 'SIGNAL LOST';
            if (t < 0.47) return 'REACQUIRING';
            if (t < 0.54) return 'ACQUIRING';
            if (t < 0.66) return 'SIGNAL LOST';
            if (t < 0.76) return 'CONVERGING';
            return 'LOCKED';
        }

        // --- Green surveillance HUD drawn on the overlay canvas ---
        function drawHud(now) {
            var t = Math.min(1, (now - hudT0) / duration);
            var cx = w / 2;
            var cy = h / 2;

            // --- Drive map to current search position (frame-by-frame) ---
            var geo = getSearchGeo(t);
            try {
                map.jumpTo({
                    center: [geo.lng, geo.lat],
                    zoom: geo.zoom,
                    pitch: geo.pitch,
                    bearing: geo.bearing
                });
            } catch (e) {}

            // --- Reticle stays centered with subtle breathing jitter ---
            // Extra jitter during SIGNAL LOST phases
            var sState = getSearchState(t);
            var jitter = sState === 'SIGNAL LOST' ? 6 : (t < 0.76 ? 2 : 0.5);
            var rx = cx + (Math.random() - 0.5) * jitter;
            var ry = cy + (Math.random() - 0.5) * jitter;

            // --- Completion: capture frame and transition ---
            if (t >= 1.0 && !flyDone) {
                flyDone = true;
                if (hudRaf) cancelAnimationFrame(hudRaf);

                // Capture final frame for ground-break phase
                try {
                    var mapCanvas = map.getCanvas();
                    ctx.clearRect(0, 0, w, h);
                    ctx.drawImage(mapCanvas, 0, 0, w, h);

                    // Re-draw the green tint + scanlines on top
                    ctx.fillStyle = 'rgba(0, 35, 0, 0.45)';
                    ctx.fillRect(0, 0, w, h);
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
                    for (var sl = 0; sl < h; sl += 3) {
                        ctx.fillRect(0, sl, w, 1);
                    }
                } catch (e) {
                    ctx.fillStyle = '#001a00';
                    ctx.fillRect(0, 0, w, h);
                }

                // Cleanup Mapbox
                try { map.remove(); } catch (e) {}
                if (mapDiv.parentNode) mapDiv.parentNode.removeChild(mapDiv);

                eggPhaseGroundBreak();
                return;
            }

            ctx.clearRect(0, 0, w, h);

            // Green surveillance tint
            ctx.fillStyle = 'rgba(0, 35, 0, 0.45)';
            ctx.fillRect(0, 0, w, h);

            // Scanlines
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            for (var sl2 = 0; sl2 < h; sl2 += 3) {
                ctx.fillRect(0, sl2, w, 1);
            }

            // Edge vignette
            var vignette = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.max(w, h) * 0.7);
            vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
            vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, w, h);

            // ======== CROSSHAIRS (red, pulsing, at reticle position) ========
            var crossAlpha = 0.6 + Math.sin(now * 0.008) * 0.3;
            ctx.strokeStyle = 'rgba(255, 30, 30, ' + crossAlpha.toFixed(3) + ')';
            ctx.lineWidth = 1.5;
            // Horizontal
            ctx.beginPath(); ctx.moveTo(rx - 50, ry); ctx.lineTo(rx - 10, ry); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rx + 10, ry); ctx.lineTo(rx + 50, ry); ctx.stroke();
            // Vertical
            ctx.beginPath(); ctx.moveTo(rx, ry - 50); ctx.lineTo(rx, ry - 10); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rx, ry + 10); ctx.lineTo(rx, ry + 50); ctx.stroke();

            // Targeting circles
            var circleR = 30 + Math.sin(now * 0.005) * 6;
            ctx.beginPath(); ctx.arc(rx, ry, circleR, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(rx, ry, circleR * 0.4, 0, Math.PI * 2); ctx.stroke();

            // Red dot + glow
            var dotAlpha = 0.5 + Math.sin(now * 0.01) * 0.3;
            ctx.fillStyle = 'rgba(255, 30, 30, ' + dotAlpha.toFixed(3) + ')';
            ctx.beginPath(); ctx.arc(rx, ry, 3, 0, Math.PI * 2); ctx.fill();
            var dotGlow = ctx.createRadialGradient(rx, ry, 0, rx, ry, 18);
            dotGlow.addColorStop(0, 'rgba(255, 30, 30, ' + (dotAlpha * 0.4).toFixed(3) + ')');
            dotGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = dotGlow;
            ctx.beginPath(); ctx.arc(rx, ry, 18, 0, Math.PI * 2); ctx.fill();

            // Corner brackets (surveillance frame)
            ctx.strokeStyle = 'rgba(0, 255, 65, 0.5)';
            ctx.lineWidth = 2;
            var bLen = 40;
            var bOff = 60;
            // Top-left
            ctx.beginPath(); ctx.moveTo(rx - bOff, ry - bOff + bLen); ctx.lineTo(rx - bOff, ry - bOff); ctx.lineTo(rx - bOff + bLen, ry - bOff); ctx.stroke();
            // Top-right
            ctx.beginPath(); ctx.moveTo(rx + bOff - bLen, ry - bOff); ctx.lineTo(rx + bOff, ry - bOff); ctx.lineTo(rx + bOff, ry - bOff + bLen); ctx.stroke();
            // Bottom-left
            ctx.beginPath(); ctx.moveTo(rx - bOff, ry + bOff - bLen); ctx.lineTo(rx - bOff, ry + bOff); ctx.lineTo(rx - bOff + bLen, ry + bOff); ctx.stroke();
            // Bottom-right
            ctx.beginPath(); ctx.moveTo(rx + bOff - bLen, ry + bOff); ctx.lineTo(rx + bOff, ry + bOff); ctx.lineTo(rx + bOff, ry + bOff - bLen); ctx.stroke();

            // ======== ERROR NOTIFICATION (during SIGNAL LOST) ========
            drawSignalLostOverlay(ctx, w, h, t, now);

            // ======== CALLOUT PANEL (shared function) ========
            drawSurveillanceHud(ctx, w, h, rx, ry, t, now, trackLines, geo.zoom, lat, lng, sState);

            // Scanline noise
            if (Math.random() < 0.15) {
                ctx.fillStyle = 'rgba(0, 255, 65, 0.03)';
                ctx.fillRect(0, Math.random() * h, w, 1 + Math.random() * 3);
            }

            if (!flyDone) {
                hudRaf = requestAnimationFrame(drawHud);
            }
        }

        // Start HUD immediately — map position driven frame-by-frame
        hudRaf = requestAnimationFrame(drawHud);

        // --- Fallback timeout in case something goes wrong ---
        var completionFired = false;
        setTimeout(function () {
            if (!flyDone && !completionFired) {
                completionFired = true;
                flyDone = true;
                if (hudRaf) cancelAnimationFrame(hudRaf);
                try { map.remove(); } catch (e) {}
                if (mapDiv.parentNode) mapDiv.parentNode.removeChild(mapDiv);
                eggPhaseMapZoomFallback();
            }
        }, CONFIG.eggMapDuration + 3000);
    }

    // ====== PROCEDURAL FALLBACK VERSION ======
    function eggPhaseMapZoomFallback() {
        eggSequence.phase = 2;
        var ctx = eggSequence.overlayCtx;
        var canvas = eggSequence.overlayCanvas;
        var w = canvas.width;
        var h = canvas.height;

        var lat = 0, lng = 0;
        if (geoData.loc) {
            var parts = geoData.loc.split(',');
            lat = parseFloat(parts[0]) || 0;
            lng = parseFloat(parts[1]) || 0;
        }
        var cityName = geoData.city ? geoData.city.toUpperCase() : 'UNKNOWN';
        var regionName = geoData.region ? geoData.region.toUpperCase() : '';
        var countryCode = geoData.country || '??';

        var t0 = performance.now();
        var duration = CONFIG.eggMapDuration;
        var radarAngle = 0;
        var zoom = 1;
        var centerX = w / 2;
        var centerY = h / 2;

        var trackLines = [
            'INITIATING TRACE...',
            'TARGET: ' + lat.toFixed(4) + ', ' + lng.toFixed(4),
            'LOCATION: ' + cityName + (regionName ? ', ' + regionName : '') + ' // ' + countryCode,
            'SIGNAL LOCKED'
        ];

        // --- Seeded RNG from coordinates ---
        var seed = Math.abs(lat * 10000 + lng * 10000) + 1;
        function srand(s) {
            var x = Math.sin(s) * 10000;
            return x - Math.floor(x);
        }

        // --- Pre-generate procedural map data ---
        var coastPts = [];
        var coastN = 32;
        for (var ci = 0; ci < coastN; ci++) {
            var ang = (ci / coastN) * Math.PI * 2;
            var rad = 0.25 + srand(seed + ci * 7) * 0.18;
            rad += Math.sin(ang * 3 + srand(seed + ci) * 6) * 0.06;
            rad += Math.sin(ang * 7 + srand(seed + ci + 100) * 4) * 0.03;
            coastPts.push({ mx: Math.cos(ang) * rad, my: Math.sin(ang) * rad });
        }

        var contours = [];
        for (var cl = 1; cl <= 4; cl++) {
            var cRing = [];
            var shrink = 1 - cl * 0.18;
            for (var ci2 = 0; ci2 < coastN; ci2++) {
                cRing.push({
                    mx: coastPts[ci2].mx * shrink + (srand(seed + cl * 200 + ci2) - 0.5) * 0.03,
                    my: coastPts[ci2].my * shrink + (srand(seed + cl * 300 + ci2) - 0.5) * 0.03
                });
            }
            contours.push(cRing);
        }

        var rivers = [];
        var riverCount = 2 + Math.floor(srand(seed + 500) * 2);
        for (var ri = 0; ri < riverCount; ri++) {
            var rPts = [];
            var rAng = srand(seed + 600 + ri) * Math.PI * 2;
            var rx = 0, ry = 0;
            for (var rs = 0; rs < 12; rs++) {
                rPts.push({ mx: rx, my: ry });
                rAng += (srand(seed + 700 + ri * 100 + rs) - 0.5) * 1.2;
                rx += Math.cos(rAng) * 0.035;
                ry += Math.sin(rAng) * 0.035;
            }
            rivers.push(rPts);
        }

        var roads = [];
        var roadCount = 5 + Math.floor(srand(seed + 800) * 4);
        for (var rdi = 0; rdi < roadCount; rdi++) {
            var rdAng = srand(seed + 900 + rdi) * Math.PI * 2;
            var rdLen = 0.15 + srand(seed + 1000 + rdi) * 0.25;
            var rdCurve = (srand(seed + 1100 + rdi) - 0.5) * 0.08;
            roads.push({
                mx1: Math.cos(rdAng) * 0.02, my1: Math.sin(rdAng) * 0.02,
                mx2: Math.cos(rdAng + rdCurve) * rdLen, my2: Math.sin(rdAng + rdCurve) * rdLen,
                major: rdi < 3
            });
        }

        var blocks = [];
        var blockExt = 10;
        var blockUnit = 0.012;
        for (var bx = -blockExt; bx <= blockExt; bx++) {
            for (var by = -blockExt; by <= blockExt; by++) {
                var bdist = Math.sqrt(bx * bx + by * by);
                if (bdist > blockExt) continue;
                if (srand(seed + bx * 137 + by * 311) > 0.35 + bdist * 0.04) continue;
                var bw = blockUnit * (0.6 + srand(seed + bx * 51 + by * 73) * 0.6);
                var bh = blockUnit * (0.6 + srand(seed + bx * 51 + by * 73 + 1) * 0.6);
                blocks.push({
                    mx: bx * blockUnit * 1.4 + (srand(seed + bx * 19 + by * 23) - 0.5) * 0.003,
                    my: by * blockUnit * 1.4 + (srand(seed + bx * 29 + by * 31) - 0.5) * 0.003,
                    mw: bw, mh: bh
                });
            }
        }

        var streetNames = ['MAIN ST', 'OAK AVE', '1ST', '2ND', '3RD', 'ELM', 'PARK', 'RIVER RD', 'HWY 1', 'CENTRAL'];

        // --- Search phases with false lock-ons (matches Mapbox version) ---
        var fbFL1 = { x: (srand(seed + 3000) - 0.5) * w * 0.5, y: (srand(seed + 3001) - 0.5) * h * 0.4 };
        var fbFL2 = { x: (srand(seed + 3002) - 0.5) * w * 0.35, y: (srand(seed + 3003) - 0.5) * h * 0.3 };
        var fbJA1 = { x: fbFL1.x + (srand(seed + 3004) > 0.5 ? 1 : -1) * (w * 0.12 + srand(seed + 3005) * w * 0.1), y: fbFL1.y + (srand(seed + 3006) - 0.5) * h * 0.2 };
        var fbJA2 = { x: fbFL2.x + (srand(seed + 3007) > 0.5 ? 1 : -1) * (w * 0.1 + srand(seed + 3008) * w * 0.08), y: fbFL2.y + (srand(seed + 3009) - 0.5) * h * 0.15 };
        var fbDriftStart = { x: (srand(seed + 3010) - 0.5) * w * 0.3, y: (srand(seed + 3011) - 0.5) * h * 0.25 };

        function getFbSearchOffset(t) {
            var ox = 0, oy = 0, jitter = 0;
            if (t < 0.18) {
                var st = t / 0.18;
                var ease = st * st * (3 - 2 * st);
                ox = fbDriftStart.x + (fbFL1.x - fbDriftStart.x) * ease;
                oy = fbDriftStart.y + (fbFL1.y - fbDriftStart.y) * ease;
                jitter = 6 * (1 - st);
            } else if (t < 0.25) {
                var st2 = (t - 0.18) / 0.07;
                ox = fbFL1.x + Math.sin(st2 * 6) * 4;
                oy = fbFL1.y + Math.cos(st2 * 8) * 3;
                jitter = 1;
            } else if (t < 0.37) {
                var jt = (t - 0.25) / 0.12;
                var jEase = jt < 0.15 ? jt / 0.15 : 1;
                ox = fbFL1.x + (fbJA1.x - fbFL1.x) * jEase;
                oy = fbFL1.y + (fbJA1.y - fbFL1.y) * jEase;
                jitter = 12 * (1 - jt);
            } else if (t < 0.47) {
                var st3 = (t - 0.37) / 0.10;
                var ease3 = st3 * st3 * (3 - 2 * st3);
                ox = fbJA1.x + (fbFL2.x - fbJA1.x) * ease3;
                oy = fbJA1.y + (fbFL2.y - fbJA1.y) * ease3;
                jitter = 5 * (1 - st3);
            } else if (t < 0.54) {
                var st4 = (t - 0.47) / 0.07;
                ox = fbFL2.x + Math.sin(st4 * 7) * 3;
                oy = fbFL2.y + Math.cos(st4 * 9) * 2;
                jitter = 1;
            } else if (t < 0.66) {
                var jt2 = (t - 0.54) / 0.12;
                var jEase2 = jt2 < 0.15 ? jt2 / 0.15 : 1;
                ox = fbFL2.x + (fbJA2.x - fbFL2.x) * jEase2;
                oy = fbFL2.y + (fbJA2.y - fbFL2.y) * jEase2;
                jitter = 12 * (1 - jt2);
            } else if (t < 0.76) {
                var st5 = (t - 0.66) / 0.10;
                var ease5 = st5 * st5 * (3 - 2 * st5);
                ox = fbJA2.x * (1 - ease5);
                oy = fbJA2.y * (1 - ease5);
                jitter = 2 * (1 - st5);
            }
            ox += (srand(seed + t * 1000) - 0.5) * jitter;
            oy += (srand(seed + t * 2000) - 0.5) * jitter;
            return { x: ox, y: oy };
        }

        function getFbSearchState(t) {
            if (t < 0.18) return 'SCANNING';
            if (t < 0.25) return 'ACQUIRING';
            if (t < 0.37) return 'SIGNAL LOST';
            if (t < 0.47) return 'REACQUIRING';
            if (t < 0.54) return 'ACQUIRING';
            if (t < 0.66) return 'SIGNAL LOST';
            if (t < 0.76) return 'CONVERGING';
            return 'LOCKED';
        }

        var panAngle = srand(seed + 5000) * Math.PI * 2;
        var panMaxX = w * 0.18;
        var panMaxY = h * 0.14;
        var panDriftX = Math.cos(panAngle) * panMaxX;
        var panDriftY = Math.sin(panAngle) * panMaxY;

        function tx(mx) { return centerX + mx * w * zoom; }
        function ty(my) { return centerY + my * h * zoom; }

        function drawMapFrame(now) {
            var t = Math.min(1, (now - t0) / duration);

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);

            zoom = 1 + t * 20;

            var panEase = t * t;
            centerX = w / 2 + panDriftX * panEase;
            centerY = h / 2 + panDriftY * panEase;

            // --- Coastline fill ---
            ctx.fillStyle = 'rgba(0, 255, 65, 0.04)';
            ctx.beginPath();
            ctx.moveTo(tx(coastPts[0].mx), ty(coastPts[0].my));
            for (var cp = 1; cp < coastPts.length; cp++) {
                var next = coastPts[(cp + 1) % coastPts.length];
                var cpx = (tx(coastPts[cp].mx) + tx(next.mx)) / 2;
                var cpy = (ty(coastPts[cp].my) + ty(next.my)) / 2;
                ctx.quadraticCurveTo(tx(coastPts[cp].mx), ty(coastPts[cp].my), cpx, cpy);
            }
            ctx.closePath();
            ctx.fill();

            // --- Coastline stroke ---
            ctx.strokeStyle = 'rgba(0, 255, 65, 0.35)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tx(coastPts[0].mx), ty(coastPts[0].my));
            for (var cs = 1; cs < coastPts.length; cs++) {
                var csNext = coastPts[(cs + 1) % coastPts.length];
                var csx = (tx(coastPts[cs].mx) + tx(csNext.mx)) / 2;
                var csy = (ty(coastPts[cs].my) + ty(csNext.my)) / 2;
                ctx.quadraticCurveTo(tx(coastPts[cs].mx), ty(coastPts[cs].my), csx, csy);
            }
            ctx.closePath();
            ctx.stroke();

            // --- Contour lines ---
            for (var cli = 0; cli < contours.length; cli++) {
                var cRing2 = contours[cli];
                ctx.strokeStyle = 'rgba(0, 255, 65, ' + (0.10 + cli * 0.03).toFixed(2) + ')';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(tx(cRing2[0].mx), ty(cRing2[0].my));
                for (var ck = 1; ck < cRing2.length; ck++) {
                    var ckNext = cRing2[(ck + 1) % cRing2.length];
                    var ckx = (tx(cRing2[ck].mx) + tx(ckNext.mx)) / 2;
                    var cky = (ty(cRing2[ck].my) + ty(ckNext.my)) / 2;
                    ctx.quadraticCurveTo(tx(cRing2[ck].mx), ty(cRing2[ck].my), ckx, cky);
                }
                ctx.closePath();
                ctx.stroke();
            }

            // --- Rivers ---
            for (var rvi = 0; rvi < rivers.length; rvi++) {
                var rPts2 = rivers[rvi];
                ctx.strokeStyle = 'rgba(0, 120, 200, 0.25)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(tx(rPts2[0].mx), ty(rPts2[0].my));
                for (var rvk = 1; rvk < rPts2.length; rvk++) {
                    ctx.lineTo(tx(rPts2[rvk].mx), ty(rPts2[rvk].my));
                }
                ctx.stroke();
            }

            // --- Roads ---
            if (zoom > 2) {
                var roadAlpha = Math.min(0.4, (zoom - 2) * 0.05);
                for (var rdj = 0; rdj < roads.length; rdj++) {
                    var rd = roads[rdj];
                    ctx.strokeStyle = rd.major
                        ? 'rgba(0, 255, 65, ' + (roadAlpha * 1.5).toFixed(2) + ')'
                        : 'rgba(0, 255, 65, ' + roadAlpha.toFixed(2) + ')';
                    ctx.lineWidth = rd.major ? 2 : 1;
                    ctx.beginPath();
                    ctx.moveTo(tx(rd.mx1), ty(rd.my1));
                    ctx.lineTo(tx(rd.mx2), ty(rd.my2));
                    ctx.stroke();
                }
            }

            // --- City blocks ---
            if (zoom > 5) {
                var blockAlpha = Math.min(0.3, (zoom - 5) * 0.03);
                for (var bi = 0; bi < blocks.length; bi++) {
                    var blk = blocks[bi];
                    var bsx = tx(blk.mx - blk.mw / 2);
                    var bsy = ty(blk.my - blk.mh / 2);
                    var bsw = blk.mw * w * zoom;
                    var bsh = blk.mh * h * zoom;
                    if (bsx + bsw > 0 && bsx < w && bsy + bsh > 0 && bsy < h) {
                        ctx.fillStyle = 'rgba(0, 255, 65, ' + (blockAlpha * 0.4).toFixed(3) + ')';
                        ctx.fillRect(bsx, bsy, bsw, bsh);
                        ctx.strokeStyle = 'rgba(0, 255, 65, ' + blockAlpha.toFixed(3) + ')';
                        ctx.lineWidth = 0.8;
                        ctx.strokeRect(bsx, bsy, bsw, bsh);
                    }
                }
            }

            // --- Street labels ---
            if (zoom > 10) {
                ctx.font = '9px monospace';
                var lblAlpha = Math.min(0.4, (zoom - 10) * 0.04);
                ctx.fillStyle = 'rgba(0, 255, 65, ' + lblAlpha.toFixed(2) + ')';
                for (var sli = 0; sli < Math.min(roads.length, streetNames.length); sli++) {
                    var srd = roads[sli];
                    var slx = tx((srd.mx1 + srd.mx2) / 2);
                    var sly = ty((srd.my1 + srd.my2) / 2);
                    if (slx > 0 && slx < w && sly > 0 && sly < h) {
                        ctx.fillText(streetNames[sli], slx + 3, sly - 3);
                    }
                }
            }

            // --- Lat/Lng grid lines ---
            var gridSpace = 200 / zoom;
            while (gridSpace < 25) gridSpace *= 2;
            while (gridSpace > 80) gridSpace /= 2;
            ctx.strokeStyle = 'rgba(0, 255, 65, 0.10)';
            ctx.lineWidth = 0.5;
            var gOffX = centerX % gridSpace;
            var gOffY = centerY % gridSpace;
            for (var ggx = gOffX; ggx < w; ggx += gridSpace) {
                ctx.beginPath(); ctx.moveTo(ggx, 0); ctx.lineTo(ggx, h); ctx.stroke();
            }
            for (var ggy = gOffY; ggy < h; ggy += gridSpace) {
                ctx.beginPath(); ctx.moveTo(0, ggy); ctx.lineTo(w, ggy); ctx.stroke();
            }

            // --- Radar overlay ---
            var maxRing = Math.min(w, h) * 0.42;
            for (var rri = 1; rri <= 4; rri++) {
                var rrR = (rri / 4) * maxRing;
                ctx.strokeStyle = 'rgba(0, 255, 65, 0.07)';
                ctx.lineWidth = rri === 4 ? 1.2 : 0.6;
                ctx.beginPath(); ctx.arc(centerX, centerY, rrR, 0, Math.PI * 2); ctx.stroke();
            }

            radarAngle += 0.03;
            ctx.strokeStyle = 'rgba(0, 255, 65, 0.30)';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + Math.cos(radarAngle) * maxRing, centerY + Math.sin(radarAngle) * maxRing); ctx.stroke();
            for (var sw = 1; sw <= 6; sw++) {
                ctx.strokeStyle = 'rgba(0, 255, 65, ' + (0.25 * (1 - sw / 7)).toFixed(3) + ')';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(centerX, centerY);
                var sa = radarAngle - sw * 0.05;
                ctx.lineTo(centerX + Math.cos(sa) * maxRing, centerY + Math.sin(sa) * maxRing); ctx.stroke();
            }

            // --- Searching reticle offset ---
            var fbOff = getFbSearchOffset(t);
            var rx = centerX + fbOff.x;
            var ry = centerY + fbOff.y;

            // --- Crosshairs (at reticle position) ---
            var crossAlpha = 0.6 + Math.sin(now * 0.008) * 0.3;
            ctx.strokeStyle = 'rgba(255, 30, 30, ' + crossAlpha.toFixed(3) + ')';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(rx - 40, ry); ctx.lineTo(rx - 8, ry); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rx + 8, ry); ctx.lineTo(rx + 40, ry); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rx, ry - 40); ctx.lineTo(rx, ry - 8); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rx, ry + 8); ctx.lineTo(rx, ry + 40); ctx.stroke();

            var circleR = 25 + Math.sin(now * 0.005) * 5;
            ctx.beginPath(); ctx.arc(rx, ry, circleR, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(rx, ry, circleR * 0.45, 0, Math.PI * 2); ctx.stroke();

            var dotAlpha = 0.5 + Math.sin(now * 0.01) * 0.3;
            ctx.fillStyle = 'rgba(255, 30, 30, ' + dotAlpha.toFixed(3) + ')';
            ctx.beginPath(); ctx.arc(rx, ry, 3, 0, Math.PI * 2); ctx.fill();
            var dotGlow = ctx.createRadialGradient(rx, ry, 0, rx, ry, 15);
            dotGlow.addColorStop(0, 'rgba(255, 30, 30, ' + (dotAlpha * 0.4).toFixed(3) + ')');
            dotGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = dotGlow;
            ctx.beginPath(); ctx.arc(rx, ry, 15, 0, Math.PI * 2); ctx.fill();

            // --- Error notification (shared) ---
            drawSignalLostOverlay(ctx, w, h, t, now);

            // --- Callout panel (shared) ---
            var fbState = getFbSearchState(t);
            drawSurveillanceHud(ctx, w, h, rx, ry, t, now, trackLines, zoom, lat, lng, fbState);

            if (Math.random() < 0.2) {
                ctx.fillStyle = 'rgba(0, 255, 65, 0.03)';
                ctx.fillRect(0, Math.random() * h, w, 1 + Math.random() * 3);
            }

            if (t < 1) {
                requestAnimationFrame(drawMapFrame);
            } else {
                eggPhaseGroundBreak();
            }
        }
        requestAnimationFrame(drawMapFrame);
    }

    function eggPhaseGroundBreak() {
        eggSequence.phase = 3;
        var ctx = eggSequence.overlayCtx;
        var canvas = eggSequence.overlayCanvas;
        var w = canvas.width;
        var h = canvas.height;

        var mapCapture = ctx.getImageData(0, 0, w, h);
        var t0 = performance.now();
        var duration = CONFIG.eggGroundBreakDuration;

        screenFlash('rgba(255, 50, 50, 0.4)', 100);

        function animateGroundBreak(now) {
            var t = Math.min(1, (now - t0) / duration);

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);
            ctx.putImageData(mapCapture, 0, 0);

            // Horizontal slice displacement
            var sliceCount = 15 + Math.floor(t * 30);
            for (var s = 0; s < sliceCount; s++) {
                var sy = Math.floor(Math.random() * h);
                var sh = 2 + Math.floor(Math.random() * (10 + t * 30));
                var shift = (Math.random() - 0.5) * t * 200;
                try {
                    var sliceData = ctx.getImageData(0, sy, w, Math.min(sh, h - sy));
                    ctx.putImageData(sliceData, shift, sy);
                } catch (e) {}
            }

            // Color channel separation
            if (t > 0.3) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = t * 0.3;
                ctx.drawImage(canvas, (Math.random() - 0.5) * t * 20, 0);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            }

            // Static noise
            var noiseAmount = Math.floor(t * 800);
            ctx.fillStyle = '#00ff41';
            for (var n = 0; n < noiseAmount; n++) {
                ctx.globalAlpha = Math.random() * 0.4;
                ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
            }
            ctx.globalAlpha = 1;

            // Flash red error text
            if (t > 0.5 && Math.random() < 0.4) {
                ctx.font = 'bold 24px monospace';
                ctx.fillStyle = '#ff0041';
                var errMsg = GLITCH_ERRORS[Math.floor(Math.random() * GLITCH_ERRORS.length)];
                ctx.fillText(errMsg, Math.random() * (w - 300), h * 0.2 + Math.random() * h * 0.6);
            }

            if (t < 1) {
                requestAnimationFrame(animateGroundBreak);
            } else {
                eggPhaseShutdown();
            }
        }
        requestAnimationFrame(animateGroundBreak);
    }

    function eggPhaseShutdown() {
        eggSequence.phase = 4;
        var ctx = eggSequence.overlayCtx;
        var canvas = eggSequence.overlayCanvas;
        var w = canvas.width;
        var h = canvas.height;

        var t0 = performance.now();
        var duration = CONFIG.eggShutdownDuration;

        canvas.style.zIndex = '999';

        var hintsEl = document.getElementById('hints');
        hintsEl.style.opacity = '0';

        powerLed.style.background = '#ff0041';
        powerLed.style.boxShadow = '0 0 4px #ff0041, 0 0 8px #ff0041, 0 0 16px rgba(255, 0, 65, 0.4)';

        function animateShutdown(now) {
            var t = Math.min(1, (now - t0) / duration);
            ctx.clearRect(0, 0, w, h);

            if (t < 0.3) {
                // Rapid error flashes
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, w, h);
                if (Math.random() < 0.7) {
                    ctx.font = 'bold ' + (16 + Math.floor(Math.random() * 20)) + 'px monospace';
                    ctx.fillStyle = Math.random() < 0.5 ? '#ff0041' : '#00ff41';
                    var err = GLITCH_ERRORS[Math.floor(Math.random() * GLITCH_ERRORS.length)];
                    ctx.fillText(err, 20 + Math.random() * (w - 400), h * 0.3 + Math.random() * h * 0.4);
                }
                for (var n = 0; n < 200; n++) {
                    ctx.fillStyle = 'rgba(' +
                        Math.floor(Math.random() * 255) + ',' +
                        Math.floor(Math.random() * 255) + ',' +
                        Math.floor(Math.random() * 255) + ', 0.1)';
                    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
                }
            } else if (t < 0.7) {
                // Collapse to horizontal line
                var subT = (t - 0.3) / 0.4;
                var eased = subT * subT;
                var lineH = Math.max(2, h * (1 - eased));
                var lineY = (h - lineH) / 2;

                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = 'rgba(200, 255, 220, ' + (0.8 + Math.sin(now * 0.05) * 0.2).toFixed(2) + ')';
                ctx.fillRect(0, lineY, w, lineH);

                var glowGrad = ctx.createLinearGradient(0, lineY - 20, 0, lineY + lineH + 20);
                glowGrad.addColorStop(0, 'rgba(0, 255, 65, 0)');
                glowGrad.addColorStop(0.3, 'rgba(0, 255, 65, 0.1)');
                glowGrad.addColorStop(0.5, 'rgba(0, 255, 65, 0.3)');
                glowGrad.addColorStop(0.7, 'rgba(0, 255, 65, 0.1)');
                glowGrad.addColorStop(1, 'rgba(0, 255, 65, 0)');
                ctx.fillStyle = glowGrad;
                ctx.fillRect(0, lineY - 20, w, lineH + 40);
            } else {
                // Line shrinks to dot then fades
                var subT2 = (t - 0.7) / 0.3;
                var eased2 = subT2 * subT2;

                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, w, h);

                var dotW = Math.max(2, w * (1 - eased2));
                var dotH = 2;
                var dotX = (w - dotW) / 2;
                var dotY = h / 2 - 1;
                var dotAlpha = Math.max(0, 1 - subT2 * 1.5);

                ctx.fillStyle = 'rgba(200, 255, 220, ' + dotAlpha.toFixed(2) + ')';
                ctx.fillRect(dotX, dotY, dotW, dotH);

                if (dotAlpha > 0.1) {
                    var dotGlow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 30);
                    dotGlow.addColorStop(0, 'rgba(0, 255, 65, ' + (dotAlpha * 0.3).toFixed(2) + ')');
                    dotGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = dotGlow;
                    ctx.beginPath();
                    ctx.arc(w / 2, h / 2, 30, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            if (t < 1) {
                requestAnimationFrame(animateShutdown);
            } else {
                powerLed.style.opacity = '0';
                powerLed.style.background = '';
                powerLed.style.boxShadow = '';
                powerLed.style.animation = 'none';
                eggPhaseBlackAndReboot();
            }
        }
        requestAnimationFrame(animateShutdown);
    }

    function eggPhaseBlackAndReboot() {
        eggSequence.phase = 5;
        var ctx = eggSequence.overlayCtx;
        var canvas = eggSequence.overlayCanvas;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        setTimeout(function () {
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
            eggSequence.overlayCanvas = null;
            eggSequence.overlayCtx = null;

            // Reset scene
            sceneEl.style.opacity = '1';
            var overlayEl = document.getElementById('overlay');
            overlayEl.style.opacity = '1';
            var hintsEl = document.getElementById('hints');
            hintsEl.style.opacity = '';

            eggSequence.active = false;
            eggSequence.phase = 0;

            initRain();
            replayBootSequence();
        }, CONFIG.eggBlackDuration);
    }

    function replayBootSequence() {
        var newBootScreen = document.createElement('div');
        newBootScreen.id = 'boot-screen';
        var newBootLine = document.createElement('div');
        newBootLine.id = 'boot-line';
        var newBootSource = document.createElement('div');
        newBootSource.id = 'boot-source';
        newBootSource.innerHTML = '<a href="https://github.com/straplocked/matrix-hello-world" target="_blank" rel="noopener">github.com/straplocked/matrix-hello-world</a>';
        newBootScreen.appendChild(newBootLine);
        newBootScreen.appendChild(newBootSource);
        document.body.insertBefore(newBootScreen, document.body.firstChild);
        document.body.classList.add('booting');

        setTimeout(function () {
            powerLed.style.opacity = '1';
            powerLed.style.animation = 'none';
            powerLed.style.background = '#00ff41';
            powerLed.style.boxShadow = '0 0 4px #00ff41, 0 0 8px #00ff41';
        }, 200);

        setTimeout(function () {
            newBootLine.style.transition = 'width 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            newBootLine.style.width = '60%';
        }, 400);

        setTimeout(function () {
            newBootLine.style.transition = 'opacity 0.05s';
            newBootLine.style.opacity = '0.3';
        }, 600);
        setTimeout(function () { newBootLine.style.opacity = '1'; }, 650);
        setTimeout(function () { newBootLine.style.opacity = '0.5'; }, 680);
        setTimeout(function () { newBootLine.style.opacity = '1'; }, 710);

        setTimeout(function () {
            newBootLine.style.transition = 'width 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)';
            newBootLine.style.width = '95%';
        }, 750);

        setTimeout(function () {
            newBootLine.style.transition = 'width 0.2s ease, height 0.6s cubic-bezier(0.22, 0.61, 0.36, 1), background 0.4s ease, box-shadow 0.4s ease';
            newBootLine.style.width = '100%';
            newBootLine.style.height = '100%';
            newBootLine.style.borderRadius = '0';
            newBootLine.style.background = 'rgba(0, 255, 65, 0.08)';
            newBootLine.style.boxShadow = '0 0 60px rgba(0, 255, 65, 0.15), inset 0 0 100px rgba(0, 255, 65, 0.05)';
        }, 1050);

        setTimeout(function () {
            newBootScreen.style.transition = 'background 0.12s ease';
            newBootScreen.style.background = 'rgba(0, 255, 65, 0.2)';
        }, 1500);
        setTimeout(function () {
            newBootScreen.style.transition = 'background 0.15s ease';
            newBootScreen.style.background = 'rgba(0, 255, 65, 0.08)';
        }, 1620);

        setTimeout(function () {
            if (newBootSource) newBootSource.classList.add('visible');
        }, 1650);

        setTimeout(function () {
            newBootScreen.style.transition = 'opacity 0.4s ease-out';
            newBootScreen.style.opacity = '0';
        }, 1800);

        setTimeout(function () {
            if (newBootScreen.parentNode) newBootScreen.parentNode.removeChild(newBootScreen);
            document.body.classList.remove('booting');
            powerLed.style.boxShadow = '';
            powerLed.style.animation = '';
            powerLed.style.background = '';
            redDot.hasTriggered = false;
            preloadMapbox();
            scheduleRedDot();
        }, 2300);
    }

    // --- LED Random Flicker ---
    function flickerLed() {
        if (document.body.classList.contains('booting') || eggSequence.active) {
            setTimeout(flickerLed, 2000 + Math.random() * 3000);
            return;
        }
        var count = 1 + Math.floor(Math.random() * 3);
        var i = 0;
        function flick() {
            powerLed.style.opacity = (0.1 + Math.random() * 0.2).toFixed(2);
            setTimeout(function () {
                powerLed.style.opacity = '';
                i++;
                if (i < count) setTimeout(flick, 40 + Math.random() * 70);
            }, 30 + Math.random() * 50);
        }
        flick();
        setTimeout(flickerLed, 4000 + Math.random() * 8000);
    }
    setTimeout(flickerLed, 5000 + Math.random() * 5000);

})();
