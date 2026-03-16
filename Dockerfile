FROM nginx:1.27-alpine

LABEL org.opencontainers.image.source=https://github.com/straplocked/matrix-hello-world
LABEL org.opencontainers.image.description="Matrix-themed interactive web visualization"

RUN rm -rf /usr/share/nginx/html/*

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY src/ /usr/share/nginx/html/

RUN mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp /tmp/nginx && \
    chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/run /var/log/nginx /tmp/nginx && \
    sed -i 's/^user  nginx;/# user directive not needed when running as nginx/' /etc/nginx/nginx.conf && \
    sed -i 's|pid\s*/run/nginx.pid;|pid /tmp/nginx/nginx.pid;|' /etc/nginx/nginx.conf

USER nginx

EXPOSE 8080
