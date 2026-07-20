# Deployment

Target host: `130.61.233.86` (Oracle Cloud, RHEL 9, aarch64), user `opc`,
rootless Podman. Public URL: <https://polttoaine.duckdns.org>.

## How it fits with the other stacks

The host already runs `ratikka` and `tieliikenne`. Only the **ratikka** stack
owns ports 80/443 — its Caddy container terminates TLS for every site and
reverse-proxies to the other backends over the shared external `web-proxy`
podman network. `bensa` follows `tieliikenne`'s pattern exactly: no ports
published, no Caddy of its own, just a backend and a Redis attached to
`web-proxy`.

```
                    :443  ┌───────────────────────┐
polttoaine.duckdns.org ──▶│ ratikka_ratikka-caddy │──▶ bensa-backend:8080
                          └───────────────────────┘     (web-proxy network)
```

## First-time setup

DNS: `polttoaine.duckdns.org` must have an A record pointing at
`130.61.233.86`. Caddy provisions the certificate automatically on first
request once that resolves.

```bash
ssh -i ~/.ssh/ssh-key-2022-10-26.key opc@130.61.233.86

mkdir -p ~/bensa && cd ~/bensa
# copy deploy/docker-compose.yml and deploy/update.sh from the repo
chmod +x update.sh

# Tankille account credentials — podman-compose reads this file automatically
cat > .env <<'EOF'
TANKILLE_EMAIL=you@example.com
TANKILLE_PASSWORD=...
EOF
chmod 600 .env

podman-compose up -d
```

Add the vhost to the shared Caddy config and reload it:

```bash
cat >> ~/ratikka/Caddyfile <<'EOF'

polttoaine.duckdns.org {
    reverse_proxy bensa-backend:8080
    encode gzip zstd
}
EOF
podman exec ratikka_ratikka-caddy_1 caddy reload --config /etc/caddy/Caddyfile
```

The Caddy container must also be on the `web-proxy` network to reach
`bensa-backend` by name.

Finally, register the auto-update cron alongside the existing two:

```bash
(crontab -l; echo '*/5 * * * * /home/opc/bensa/update.sh') | crontab -
```

## Continuous deployment

Pushing to `main` runs `.github/workflows/docker-build.yml`, which tags the
commit (patch bump by default), builds `linux/amd64` + `linux/arm64`, and
pushes to `ghcr.io/saavuori/bensa`. Within five minutes `update.sh` notices the
new digest and does a full `podman-compose down && up -d` — the only sequence
that reliably picks up a new image under rootless Podman.

Watchtower is deliberately not used: it does not work with rootless Podman on
RHEL.

## Checks

```bash
curl -s https://polttoaine.duckdns.org/api/health
curl -s https://polttoaine.duckdns.org/api/version
podman logs --tail 50 bensa-backend
tail -20 ~/bensa/update.log
```
