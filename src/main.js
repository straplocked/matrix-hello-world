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
        waveDamping: 0.985,
        waveDropRadius: 24,
        waveDropStrength: 30,
        waveStepsPerFrame: 2,
        particleCount: 60,
        particleLife: 80,
        holdThreshold: 180,
        tiltMax: 2.5,
        tiltFriction: 0.05
    };

    var MESSAGES = [
        '> follow the white rabbit',
        '> there is no spoon',
        '> the construct is real',
        '> free your mind',
        '> knock knock, neo',
        '> the matrix has you'
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

    // Drop a "stone" into the wave field — organic, randomized perturbation
    function dropStone(px, py) {
        var cur = waveBuf[waveIdx];
        var cx = Math.floor(px / CONFIG.waveCellSize);
        var cy = Math.floor(py / CONFIG.waveCellSize);
        var radius = CONFIG.waveDropRadius * (0.7 + Math.random() * 0.6);
        var strength = CONFIG.waveDropStrength * (0.6 + Math.random() * 0.8);

        // Randomized ellipse for organic shape
        var stretchX = 0.8 + Math.random() * 0.4;
        var stretchY = 0.8 + Math.random() * 0.4;
        var angle = Math.random() * Math.PI;
        var cosA = Math.cos(angle);
        var sinA = Math.sin(angle);

        for (var dy = -radius; dy <= radius; dy++) {
            for (var dx = -radius; dx <= radius; dx++) {
                var gx = cx + dx;
                var gy = cy + dy;
                if (gx < 1 || gx >= waveW - 1 || gy < 1 || gy >= waveH - 1) continue;
                // Rotate and stretch for elliptical drop
                var rx = (dx * cosA - dy * sinA) * stretchX;
                var ry = (dx * sinA + dy * cosA) * stretchY;
                var dist = Math.sqrt(rx * rx + ry * ry);
                if (dist <= radius) {
                    var falloff = Math.cos(dist / radius * Math.PI * 0.5);
                    var noise = 0.85 + Math.random() * 0.3;
                    cur[gy * waveW + gx] -= strength * falloff * falloff * noise;
                }
            }
        }

        // Secondary smaller ripples nearby for natural splash feel
        for (var s = 0; s < 3; s++) {
            var ox = cx + Math.round((Math.random() - 0.5) * radius * 1.5);
            var oy = cy + Math.round((Math.random() - 0.5) * radius * 1.5);
            var sr = Math.floor(radius * (0.2 + Math.random() * 0.3));
            var ss = strength * (0.15 + Math.random() * 0.25);
            for (var dy2 = -sr; dy2 <= sr; dy2++) {
                for (var dx2 = -sr; dx2 <= sr; dx2++) {
                    var sx = ox + dx2;
                    var sy = oy + dy2;
                    if (sx < 1 || sx >= waveW - 1 || sy < 1 || sy >= waveH - 1) continue;
                    var sd = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    if (sd <= sr) {
                        var sf = Math.cos(sd / sr * Math.PI * 0.5);
                        cur[sy * waveW + sx] -= ss * sf * sf;
                    }
                }
            }
        }
    }

    // Advance the wave simulation one time step
    function stepWave() {
        var cur = waveBuf[waveIdx];
        var prev = waveBuf[(waveIdx + 2) % 3];
        var next = waveBuf[(waveIdx + 1) % 3];

        var speed = CONFIG.waveSpeed;
        var damping = CONFIG.waveDamping;

        for (var y = 1; y < waveH - 1; y++) {
            for (var x = 1; x < waveW - 1; x++) {
                var idx = y * waveW + x;
                var laplacian = cur[idx - 1] + cur[idx + 1] +
                                cur[idx - waveW] + cur[idx + waveW] - 4.0 * cur[idx];
                next[idx] = (2.0 * cur[idx] - prev[idx] + speed * laplacian) * damping;
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
        var hasWaves = false;
        for (var i = 0, len = cur.length; i < len; i += 50) {
            if (Math.abs(cur[i]) > 0.05) { hasWaves = true; break; }
        }
        if (!hasWaves) return;

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

        // Wave simulation — advance physics and apply to columns
        for (var step = 0; step < CONFIG.waveStepsPerFrame; step++) {
            stepWave();
        }
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
        initRain();
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
            dropStone(e.clientX, e.clientY);
            screenFlash('rgba(255, 255, 255, 0.15)', 60);
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
        dropStone(mx, my);

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
                var o = Math.max(0, 1 - e * 0.85);
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
        if (shatterState.active || shatterState.cooldown) return;
        if (document.body.classList.contains('booting')) return;
        var rect = document.getElementById('hello-text').getBoundingClientRect();
        var pad = 15;
        var inText = e.clientX >= rect.left - pad && e.clientX <= rect.right + pad &&
                     e.clientY >= rect.top - pad && e.clientY <= rect.bottom + pad;
        if (inText && !shatterState.wasInText) triggerShatter(e.clientX, e.clientY);
        shatterState.wasInText = inText;
    });

    // --- LED Random Flicker ---
    function flickerLed() {
        if (document.body.classList.contains('booting')) {
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
