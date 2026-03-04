#!/bin/bash
set -e

echo "==============================="
echo "  Local CI Pipeline"
echo "  $(date)"
echo "==============================="

cd /home/straplocked/prod

echo ""
echo "[1/4] Linting compose files..."
make lint

echo ""
echo "[2/4] Building all images..."
make build

echo ""
echo "[3/4] Starting services..."
make up

echo ""
echo "[4/4] Running tests..."
sleep 3
make test

echo ""
echo "==============================="
echo "  CI Pipeline: ALL PASSED"
echo "==============================="
