#!/bin/bash
# Usage: ./scripts/new-app.sh <app-name> <port>
set -e

APP_NAME=$1
PORT=$2

if [ -z "$APP_NAME" ] || [ -z "$PORT" ]; then
    echo "Usage: $0 <app-name> <port>"
    exit 1
fi

if [ -d "$APP_NAME" ]; then
    echo "Error: Directory $APP_NAME already exists"
    exit 1
fi

if grep -q "^$PORT " ports.conf 2>/dev/null; then
    echo "Error: Port $PORT is already allocated"
    exit 1
fi

echo "Creating app scaffold: $APP_NAME on port $PORT"
mkdir -p "$APP_NAME/src"

cat > "$APP_NAME/Dockerfile" << 'HEREDOC'
FROM nginx:alpine
COPY src/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEREDOC

cat > "$APP_NAME/docker-compose.yml" << HEREDOC
services:
  ${APP_NAME}:
    build: .
    container_name: ${APP_NAME}
    ports:
      - "0.0.0.0:${PORT}:80"
    restart: unless-stopped
HEREDOC

cat > "$APP_NAME/nginx.conf" << 'HEREDOC'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    gzip on;
    gzip_types text/plain text/css application/javascript;
}
HEREDOC

cat > "$APP_NAME/src/index.html" << HEREDOC
<!DOCTYPE html>
<html><head><title>${APP_NAME}</title></head>
<body><h1>${APP_NAME}</h1></body></html>
HEREDOC

echo "${PORT} ${APP_NAME} Created $(date +%Y-%m-%d)" >> ports.conf

echo ""
echo "Done! Scaffold created at ./$APP_NAME"
echo "  - Add '$APP_NAME' to APPS in Makefile"
echo "  - Add 'test-$APP_NAME' target to Makefile"
echo "  - Port $PORT registered in ports.conf"
