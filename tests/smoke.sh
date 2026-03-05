#!/bin/bash
# ============================================================================
# Matrix Hello — Smoke Tests
# Run against live container on port 3001
# Usage: bash tests/smoke.sh [port]
# ============================================================================

PORT="${1:-3001}"
BASE="http://localhost:${PORT}"
PASS=0
FAIL=0

pass() { echo -e "  \033[32mPASS\033[0m $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  \033[31mFAIL\033[0m $1${2:+ — $2}"; FAIL=$((FAIL + 1)); }

echo ""
echo "========================================="
echo " MATRIX HELLO // SMOKE TESTS"
echo " Target: ${BASE}"
echo "========================================="
echo ""

# --- 1. Server responds ---
echo "// HTTP Connectivity"
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE}/" 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    pass "GET / returns 200"
else
    fail "GET / returns 200" "got ${HTTP_CODE:-timeout}"
fi

# --- 2. Index.html contains expected content ---
echo ""
echo "// Content Integrity"
BODY=$(curl -sf "${BASE}/" 2>/dev/null)

echo "$BODY" | grep -q "matrix-bg" && pass "index.html contains #matrix-bg" || fail "index.html contains #matrix-bg"
echo "$BODY" | grep -q "hello-text" && pass "index.html contains #hello-text" || fail "index.html contains #hello-text"
echo "$BODY" | grep -q "three.min.js" && pass "index.html references Three.js" || fail "index.html references Three.js"
echo "$BODY" | grep -q "parallax.min.js" && pass "index.html references Parallax.js" || fail "index.html references Parallax.js"
echo "$BODY" | grep -q "mapbox-gl.js" && pass "index.html references Mapbox GL JS" || fail "index.html references Mapbox GL JS"
echo "$BODY" | grep -q "main.js" && pass "index.html references main.js" || fail "index.html references main.js"
echo "$BODY" | grep -q "style.css" && pass "index.html references style.css" || fail "index.html references style.css"

# --- 3. Static assets load ---
echo ""
echo "// Static Asset Loading"
for FILE in main.js style.css; do
    # Extract the full query string version from index.html
    VERSIONED=$(echo "$BODY" | grep -oP "${FILE}\?v=[^\"\']+" | head -1)
    if [ -z "$VERSIONED" ]; then
        VERSIONED="$FILE"
    fi
    CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE}/${VERSIONED}" 2>/dev/null)
    if [ "$CODE" = "200" ]; then
        pass "${VERSIONED} returns 200"
    else
        fail "${VERSIONED} returns 200" "got ${CODE:-timeout}"
    fi
done

# --- 4. main.js content checks ---
echo ""
echo "// Application Code Integrity"
MAINJS=$(curl -sf "${BASE}/main.js" 2>/dev/null)

echo "$MAINJS" | grep -q "drawRain" && pass "main.js contains drawRain()" || fail "main.js contains drawRain()"
echo "$MAINJS" | grep -q "stepWave" && pass "main.js contains stepWave()" || fail "main.js contains stepWave()"
echo "$MAINJS" | grep -q "triggerShatter" && pass "main.js contains triggerShatter()" || fail "main.js contains triggerShatter()"
echo "$MAINJS" | grep -q "drawRedDot" && pass "main.js contains drawRedDot()" || fail "main.js contains drawRedDot()"
echo "$MAINJS" | grep -q "eggPhaseBreakApart" && pass "main.js contains eggPhaseBreakApart()" || fail "main.js contains eggPhaseBreakApart()"
echo "$MAINJS" | grep -q "eggPhaseMapHud" && pass "main.js contains eggPhaseMapHud()" || fail "main.js contains eggPhaseMapHud()"
echo "$MAINJS" | grep -q "drawSignalLostOverlay" && pass "main.js contains drawSignalLostOverlay()" || fail "main.js contains drawSignalLostOverlay()"
echo "$MAINJS" | grep -q "getSearchGeo" && pass "main.js contains getSearchGeo()" || fail "main.js contains getSearchGeo()"
echo "$MAINJS" | grep -q "getSearchState" && pass "main.js contains getSearchState()" || fail "main.js contains getSearchState()"
echo "$MAINJS" | grep -q "getFbSearchState" && pass "main.js contains getFbSearchState()" || fail "main.js contains getFbSearchState()"
echo "$MAINJS" | grep -q "drawSurveillanceHud" && pass "main.js contains drawSurveillanceHud()" || fail "main.js contains drawSurveillanceHud()"

# --- 5. Security headers ---
echo ""
echo "// Security Headers"
HEADERS=$(curl -sf -I "${BASE}/" 2>/dev/null)

echo "$HEADERS" | grep -qi "X-Frame-Options" && pass "X-Frame-Options header present" || fail "X-Frame-Options header present"
echo "$HEADERS" | grep -qi "X-Content-Type-Options" && pass "X-Content-Type-Options header present" || fail "X-Content-Type-Options header present"
echo "$HEADERS" | grep -qi "X-XSS-Protection" && pass "X-XSS-Protection header present" || fail "X-XSS-Protection header present"
echo "$HEADERS" | grep -qi "Content-Security-Policy" && pass "Content-Security-Policy header present" || fail "Content-Security-Policy header present"
echo "$HEADERS" | grep -qi "Referrer-Policy" && pass "Referrer-Policy header present" || fail "Referrer-Policy header present"

# --- 6. CSP allows required sources ---
echo ""
echo "// CSP Policy Validation"
CSP=$(echo "$HEADERS" | grep -i "Content-Security-Policy" | head -1)

echo "$CSP" | grep -q "ipinfo.io" && pass "CSP allows ipinfo.io" || fail "CSP allows ipinfo.io"
echo "$CSP" | grep -q "mapbox" && pass "CSP allows Mapbox domains" || fail "CSP allows Mapbox domains"
echo "$CSP" | grep -q "cdnjs" && pass "CSP allows cdnjs CDN" || fail "CSP allows cdnjs CDN"
echo "$CSP" | grep -q "worker-src" && pass "CSP includes worker-src (Mapbox workers)" || fail "CSP includes worker-src (Mapbox workers)"

# --- 7. Cache headers ---
echo ""
echo "// Caching Configuration"
CSS_HEADERS=$(curl -sf -I "${BASE}/style.css" 2>/dev/null)
echo "$CSS_HEADERS" | grep -qi "Cache-Control" && pass "style.css has Cache-Control header" || fail "style.css has Cache-Control header"

# --- 8. Docker container checks ---
echo ""
echo "// Container Health"
if command -v docker &>/dev/null; then
    CONTAINER_STATUS=$(sg docker -c "docker inspect -f '{{.State.Status}}' matrix-hello" 2>/dev/null)
    if [ "$CONTAINER_STATUS" = "running" ]; then
        pass "Container is running"
    else
        fail "Container is running" "status: ${CONTAINER_STATUS:-not found}"
    fi

    # Check non-root user
    CONTAINER_USER=$(sg docker -c "docker inspect -f '{{.Config.User}}' matrix-hello" 2>/dev/null)
    if [ "$CONTAINER_USER" = "nginx" ]; then
        pass "Container runs as non-root user (nginx)"
    else
        fail "Container runs as non-root user" "user: ${CONTAINER_USER:-unknown}"
    fi

    # Check read-only rootfs
    READONLY=$(sg docker -c "docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' matrix-hello" 2>/dev/null)
    if [ "$READONLY" = "true" ]; then
        pass "Container has read-only rootfs"
    else
        fail "Container has read-only rootfs" "readonly: ${READONLY:-unknown}"
    fi

    # Check cap drop
    CAPS=$(sg docker -c "docker inspect -f '{{.HostConfig.CapDrop}}' matrix-hello" 2>/dev/null)
    echo "$CAPS" | grep -qi "all" && pass "Container drops ALL capabilities" || fail "Container drops ALL capabilities" "caps: ${CAPS}"
else
    echo "  SKIP Docker not available"
fi

# --- Summary ---
echo ""
echo "========================================="
TOTAL=$((PASS + FAIL))
if [ $FAIL -eq 0 ]; then
    echo -e " \033[32mALL TESTS PASSED\033[0m (${PASS}/${TOTAL})"
else
    echo -e " \033[31mSOME TESTS FAILED\033[0m (${PASS}/${TOTAL} passed, ${FAIL} failed)"
fi
echo "========================================="
echo ""

exit $FAIL
