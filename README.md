# Personal VPS services

Docker Compose runs Anki, Sure, Navidrome, lyrics, Kashi-Koi, Shigoto, and Minecraft. Traefik serves HTTPS on ports 80/443; Minecraft publishes 25565. Backend ports are private.

## Configure

Copy `.env-*.example` files to their corresponding `.env-*` names. Keep the real files private and outside Git. Minecraft uses `/home/ubuntu/minecraft-server/.env`, or set `MINECRAFT_SERVER_DIR` to another directory containing `.env`, `data`, and `backups`.

- `.env-anki`: set a strong KasmVNC `PASSWORD`, optional AnkiWeb sync credentials, and an `ANKICONNECT_API_KEY` of at least 32 random characters. `python3 scripts/configure-anki.py` generates the key once and allows the exact Mokuro origin. The image refuses to launch Anki without a valid key or with wildcard CORS, and reapplies settings to existing volumes on every launch.
- `.env-lyrics`: set Spotify's `SP_DC` cookie.
- `.env-sure`: set `SECRET_KEY_BASE`, `POSTGRES_PASSWORD`, and the three `ACTIVE_RECORD_ENCRYPTION_*` secrets. Preserve encryption keys when upgrading.
- `.env-sure-db`: set the same `POSTGRES_PASSWORD`. PostgreSQL gets only its database credentials, not the Rails encryption/session keys.
- `.env-kashi`, `.env-shigoto`, `.env-navidrome`: follow their examples. Shigoto's Google service account key belongs at `volumes/shigoto_data/google.json`.

Generate a random secret with `openssl rand -hex 32`. Set real env files to mode 600.

Create certificate storage, owned by the VPS's Ubuntu user, UID/GID 1001:

```sh
mkdir -p traefik
touch traefik/acme.json
chmod 600 traefik/acme.json
```

Traefik runs as UID/GID 1001. Navidrome and Shigoto run as UID/GID 1000. Their persistent data directories must be writable by that user. On an existing installation, stop each service before changing ownership. Do not change the ownership of Sure's PostgreSQL directory.

## Mokuro and Anki

Use `https://anki.louismollick.com/api` in Mokuro's Anki settings and paste the private API key from `.env-anki` into Mokuro's API-key field. The allowed origin is `https://mokuro-reader-louis.vercel.app`. URL fragments such as `#/catalog` are not part of an origin. Native clients without an Origin header still need the key.

Every JSON request includes a top-level `key`:

```json
{"action":"deckNames","version":6,"key":"your-private-key"}
```

The KasmVNC desktop password and AnkiConnect API key protect separate endpoints. Collection access is powerful: AnkiConnect also supports reading local files and importing/exporting packages. Treat its key as a credential for the Anki container.

To rotate the key, update `.env-anki`, recreate Anki, then update Mokuro. A plain restart does not reread Compose env files.

## Build and update

The Anki, lyrics, Kashi, and Shigoto images are built from their respective repositories. Their workflows refresh base images daily, enforce minimum patched runtimes, and rebuild on pushes. This repository builds two additional images:

- `sure/Dockerfile` keeps the deployed Sure 0.7.6-alpha.7 application/assets while updating Ruby and its resolver. Both Sure processes use the same custom image. To upgrade Sure itself, update the upstream tag/digest in that Dockerfile and test both processes together.
- `minecraft-server/Dockerfile` keeps the itzg server scripts and supplies the current Java 25 security runtime. The stock Java 25 image lagged the October update. The runtime download is verified against the vendor's SHA-256 checksum, and the build rejects versions older than 25.0.5.

The image workflow publishes `:main` and commit tags to GHCR. Wait for image builds before deployment. Watchtower can pull rebuilt `main` tags; it cannot rebuild applications or advance a pinned Traefik version.

```sh
docker compose config --no-env-resolution --quiet
docker compose pull
docker compose up -d
docker compose ps
```

Back up data before upgrades. Avoid starting Watchtower or `anki-cleanup` while doing security maintenance. Start them after the application checks pass. Both helpers hold privileged Docker socket access; they have no shared application network, and the cleanup helper has no network at all.

## Proxy and networks

Routes live in `traefik/routes.yml`. Traefik uses the file provider and has **no Docker socket**. Apps have separate networks; Kashi also joins Navidrome's music network for its backfill. Sure's database/queue network is separate from its web network.

Routes:

- `anki.louismollick.com`: desktop on port 3000; `/api` on port 8765 with prefix stripping.
- `budget.louismollick.com`: Sure on port 3000.
- `music.louismollick.com`: Navidrome on port 4533.
- `kashi.louismollick.com`: Kashi API on port 8787.
- `spotify-lyrics-api.louismollick.com`: lyrics on port 8080, with request-size and rate limits.

HTTP redirects to HTTPS. HTTPS responses use HSTS; Sure sets secure cookies. The dashboard is disabled. Routing changes require editing the file rather than adding Docker labels.

## Host maintenance

Review and run `sudo bash scripts/harden-host.sh` on this VPS. It disables root/password SSH login, allows only the intended host ports plus Tailscale, enables UFW, disables unused RPC binding when no NFS mount is present, restricts secret-file permissions, and bounds logs for new containers. Docker-published ports bypass normal UFW filtering, so keep Compose port publications deliberate and retain the cloud firewall.

Install supported host updates and reboot when `/var/run/reboot-required` exists. Keep a second SSH session or Oracle console available. After reboot verify `uname -r`, SSH, Tailscale, Docker, and container health. Installed kernel packages do not patch a still-running old kernel.

## Persistent data

- Anki: `volumes/anki_data`.
- Navidrome: `volumes/navidrome_data`; music is mounted read-only from `music`.
- Shigoto: `volumes/shigoto_data`, writable by UID 1000.
- Sure: `volumes/sure_postgres`, plus named `sure_storage` and `sure_redis` volumes.
- Kashi: named `kashi_data` volume, including its Codex login.
- Minecraft: `/home/ubuntu/minecraft-server/data` and `backups`. Daily backups retain 14 copies.

Sure reaches CIBC Ya Later on the Mac through Tailscale installed on the host. Its containers use MagicDNS at `100.100.100.100`, with a public resolver fallback. Verify the Mac's `/simplefin/info` endpoint from the worker after network changes.

For a first Sure installation, register the admin account and close further registration in Settings > Self-Hosting > Onboarding. Preserve existing database users, bank tokens, and encryption keys during recovery.
