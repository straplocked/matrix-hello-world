FROM nginx:1.27-alpine

LABEL org.opencontainers.image.source=https://github.com/straplocked/matrix-hello-world
LABEL org.opencontainers.image.description="Matrix-themed interactive web visualization"

RUN rm -rf /usr/share/nginx/html/*

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY src/ /usr/share/nginx/html/

# Make all writable dirs owned by nginx so the container runs
# without --read-only, tmpfs mounts, or cap-drop flags.
# Security is baked in: non-root user, minimal nginx, no shell needed.
RUN mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp /tmp/nginx && \
    chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx \
                         /var/run /var/log/nginx /tmp/nginx /tmp && \
    sed -i 's/^user  nginx;/# user directive not needed when running as nginx/' /etc/nginx/nginx.conf && \
    sed -i 's|pid\s*/run/nginx.pid;|pid /tmp/nginx/nginx.pid;|' /etc/nginx/nginx.conf && \
    # Write access logs to stdout/stderr (Docker convention) instead of files
    ln -sf /dev/stdout /var/log/nginx/access.log && \
    ln -sf /dev/stderr /var/log/nginx/error.log

USER nginx

EXPOSE 8080
