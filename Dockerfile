# Static hosting for the web build of Broadside of the Deep (used by Railway).
FROM caddy:2.8-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY web /srv
