# VPS deploy runbook — groningen-1926

Mirrors the Phase 2 pattern (genealogy-viz). All commands run from the local Mac unless prefixed `vps$`.

## 0. Repo secrets (one-time, in GitHub repo settings → Secrets → Actions)

- `VPS_HOST=84.247.137.239`
- `VPS_USER=lieuwe`
- `VPS_SSH_KEY` — contents of `~/.ssh/id_bhv_deploy` (reused from Phase 1)

The old `FLY_API_TOKEN` can stay until the new workflow is green; remove it after `flyctl apps destroy groningen-1926`.

## 1. DNS (user action at Metaregistrar)

```
A    groningen-1926.lieuwejongsma.nl  84.247.137.239         TTL 300
AAAA groningen-1926.lieuwejongsma.nl  2a02:c207:2331:4129::1 TTL 300
```

Wait for propagation:

```
dig +short groningen-1926.lieuwejongsma.nl A
dig +short groningen-1926.lieuwejongsma.nl AAAA
```

## 2. VPS prep

```
vps$ sudo mkdir -p /srv/apps/groningen-1926 /srv/data/groningen-1926
vps$ sudo chown -R lieuwe:lieuwe /srv/apps/groningen-1926 /srv/data/groningen-1926
```

Copy app skeleton (compose + env template):

```
scp docker-compose.yml lieuwe@vmi3314129:/srv/apps/groningen-1926/
scp deploy/env.example lieuwe@vmi3314129:/srv/apps/groningen-1926/.env
ssh lieuwe@vmi3314129 chmod 600 /srv/apps/groningen-1926/.env
```

Then edit the VPS `.env` and fill in real `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_SECRET` (`openssl rand -hex 32` for the last one).

## 3. Migrate data from Fly volume (3 GB: sqlite + json + overrides + tiles + maps)

Wake Fly machine first (auto-stop is on):

```
curl https://groningen-1926.fly.dev/api/sections
```

Tar-pipe straight from Fly to VPS (no local intermediate copy):

```
flyctl ssh console -a groningen-1926 -C "sh -c 'tar -cf - -C /data .'" \
  | ssh lieuwe@vmi3314129 "tar -xf - -C /srv/data/groningen-1926/"
```

If the pipe stalls or you want resumable, use rsync over a temp ssh tunnel — for ~3 GB the tar pipe is fine.

Verify on VPS:

```
ssh lieuwe@vmi3314129 "ls -lh /srv/data/groningen-1926/ ; du -sh /srv/data/groningen-1926/*"
```

Expect: `adresboek.sqlite`, `json/`, `overrides/`, `tiles/`, `maps/`.

## 4. Caddy block

```
scp deploy/groningen-1926.caddyfile lieuwe@vmi3314129:/tmp/
ssh lieuwe@vmi3314129 "sudo mv /tmp/groningen-1926.caddyfile /etc/caddy/sites.d/ && sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy"
```

Caddy will provision the Let's Encrypt cert on the first HTTPS hit, provided DNS resolves.

## 5. Deploy

Push to `main` — `deploy-vps.yml` builds the image, pushes to GHCR, and SSHes the VPS to pull + restart.

```
git add -A
git commit -m "feat: migrate groningen-1926 from Fly to Contabo VPS"
git push origin main
```

Once GHCR has the image, the VPS pulls it and `docker compose up -d` brings the container up. Health check hits `/api/sections`.

## 6. Smoke test

```
curl -I https://groningen-1926.lieuwejongsma.nl/
curl -s https://groningen-1926.lieuwejongsma.nl/api/sections | head -c 300
```

Browser sanity:
- Home loads with map + entries
- `/nl/info` page renders
- Admin login at `/nl/login` works with new password
- A scan opens in OSD and tiles load
- MapLibre tiles load (visible in network tab)

## 7. Decommission Fly (after 1 week stable)

```
flyctl apps destroy groningen-1926
```

Then delete `fly.toml` and `.github/workflows/fly-deploy.yml`. Remove `FLY_API_TOKEN` from repo secrets if no other workflow uses it.

## 8. Gallery cleanup (parallel work in `playground-gallery`)

- Replace `playground-gallery/groningen-1926/index.php` with a 301-only `.htaccess`.
- Update gallery `index.html` link to `https://groningen-1926.lieuwejongsma.nl/`.
- Bump gallery `VERSION` and the boot-line label.
