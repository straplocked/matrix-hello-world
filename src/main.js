(function () {
    'use strict';

    // --- Configuration ---
    var CONFIG = {
        chars: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
               'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*',
        fontSize: 16,
        bgAlpha: 0.05,
        speed: 0.3,
        density: 0.96,
        gravityRadius: 14,
        trailLength: 30,
        waveCellSize: 6,
        waveSpeed: 0.45,
        waveDamping: 0.985,
        waveDropRadius: 5,
        waveDropStrength: 20,
        waveStepsPerFrame: 1,
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
            var spd = 0.5 + Math.random() * CONFIG.speed;
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

    // Drop a "stone" into the wave field — creates a cosine-bell perturbation
    function dropStone(px, py) {
        var cur = waveBuf[waveIdx];
        var cx = Math.floor(px / CONFIG.waveCellSize);
        var cy = Math.floor(py / CONFIG.waveCellSize);
        var radius = CONFIG.waveDropRadius;
        var strength = CONFIG.waveDropStrength;

        for (var dy = -radius; dy <= radius; dy++) {
            for (var dx = -radius; dx <= radius; dx++) {
                var gx = cx + dx;
                var gy = cy + dy;
                if (gx < 1 || gx >= waveW - 1 || gy < 1 || gy >= waveH - 1) continue;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= radius) {
                    var falloff = Math.cos(dist / radius * Math.PI * 0.5);
                    cur[gy * waveW + gx] -= strength * falloff * falloff;
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
        typewriterEl.textContent = fullText.substring(0, charIndex) + '_';
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

})();
