# Personal VPS Reverse Proxy Stack

This repository contains a Docker Compose stack for running personal services behind Traefik with automatic HTTPS from Let's Encrypt.

Current services:

- `https://anki.louismollick.com/` -> Anki desktop via KasmVNC
- `https://anki.louismollick.com/api` -> AnkiConnect API
- `https://music.louismollick.com/` -> Navidrome music server
- `https://spotify-lyrics-api.louismollick.com/` -> Spotify lyrics API

Traefik is the only public entrypoint. It listens on ports `80` and `443`, redirects HTTP to HTTPS, and stores ACME certificate state in `traefik/acme.json`.

## Requirements

Before starting:

- Ubuntu VPS with Docker Engine installed
- Docker Compose plugin installed (`docker compose`)
- DNS records pointing at the VPS public IP:
  - `anki.louismollick.com`
  - `music.louismollick.com`
  - `spotify-lyrics-api.louismollick.com`
- Ports `80/tcp` and `443/tcp` open in the VPS firewall / cloud security group

## Files In This Repo

- [`docker-compose.yml`](/Users/mollicl/personal/louismollick-server/docker-compose.yml): main stack definition
- [`/.env-anki.example`](/Users/mollicl/personal/louismollick-server/.env-anki.example): example runtime variables for Anki
- [`/.env-lyrics.example`](/Users/mollicl/personal/louismollick-server/.env-lyrics.example): example runtime variables for lyrics API
- [`/.env-navidrome.example`](/Users/mollicl/personal/louismollick-server/.env-navidrome.example): example runtime variables for Navidrome
- [`/music`](/Users/mollicl/personal/louismollick-server/music): local music library mounted read-only into Navidrome (create this yourself; it is gitignored)
- [`/traefik/acme.json`](/Users/mollicl/personal/louismollick-server/traefik/acme.json): runtime ACME state file created locally on the server
- [`/volumes/anki_data`](/Users/mollicl/personal/louismollick-server/volumes/anki_data): persistent Anki data
- [`/volumes/navidrome_data`](/Users/mollicl/personal/louismollick-server/volumes/navidrome_data): persistent Navidrome state (database, cache, artwork)

## Getting Started

### 1. Create runtime env files

Copy the committed examples into real runtime files:

```bash
cp .env-anki.example .env-anki
cp .env-lyrics.example .env-lyrics
cp .env-navidrome.example .env-navidrome
```

Then edit them:

- In `.env-anki`:
  - Set `PASSWORD` to a long random password
  - Optionally set `ANKIWEB_USER` plus either `ANKIWEB_PASSWORD` or `ANKIWEB_SYNC_KEY`
  - Adjust `TZ` if you do not want `UTC`
- In `.env-lyrics`:
  - Set `SP_DC` to your Spotify `sp_dc` cookie value
- In `.env-navidrome`:
  - Set `TZ` to your preferred timezone if you do not want `UTC`
  - Adjust `ND_SCANSCHEDULE` if you want a different rescan interval
  - Adjust `ND_LOGLEVEL` if you want more or less log verbosity

### 1b. Add your music library for Navidrome

Create the music directory and copy your audio library into it:

```bash
mkdir -p music
cp -R /path/to/your/music/. music/
```

The `navidrome` service mounts this directory read-only into the container at `/music`.

Runtime files `.env-anki`, `.env-lyrics`, and `.env-navidrome` are ignored by git.
The `music/` directory and `volumes/navidrome_data/` are also ignored by git.

### 2. Create the ACME storage file

Traefik writes certificate data into `traefik/acme.json`. You do not populate it manually.

Create it and lock down permissions:

```bash
mkdir -p traefik
touch traefik/acme.json
chmod 600 traefik/acme.json
```

### 3. Start the stack

Bring up all services:

```bash
docker compose up -d
```

If you want to inspect the resolved Compose config first:

```bash
docker compose config
```

## What Starts

The Compose stack includes:

- `traefik`: reverse proxy, HTTPS, certificate management
- `anki-desktop`: Anki desktop image with KasmVNC on internal port `3000` and AnkiConnect on internal port `8765`
- `navidrome`: music server on internal port `4533`, with persistent state in `./volumes/navidrome_data`
  - Mounts `./music` read-only into `/music` so your catalog is available to the server
- `spotify-lyrics-api`: lyrics service on internal port `8080`
- `watchtower`: periodically checks for newer images and updates labeled containers

The app containers do not publish host ports directly. Only Traefik binds `80` and `443`.

## First Boot Verification

After `docker compose up -d`, verify the stack:

### Check container status

```bash
docker compose ps
```

### Check logs

Traefik:

```bash
docker compose logs -f traefik
```

Watchtower:

```bash
docker compose logs -f watchtower
```

### Confirm HTTPS routes

Open these URLs in a browser:

- `https://anki.louismollick.com/`
- `https://music.louismollick.com/`
- `https://anki.louismollick.com/api`
- `https://spotify-lyrics-api.louismollick.com/`

Expected behavior:

- `http://` requests redirect to `https://`
- `https://anki.louismollick.com/` loads the Anki KasmVNC page
- `https://music.louismollick.com/` loads the Navidrome UI
- `https://anki.louismollick.com/api` reaches AnkiConnect through Traefik
- `https://spotify-lyrics-api.louismollick.com/` reaches the lyrics API through Traefik

You can also test redirects from the server:

```bash
curl -I http://anki.louismollick.com/
curl -I http://spotify-lyrics-api.louismollick.com/
```

## Updating Services

Watchtower is configured to:

- check every 300 seconds
- clean up old images after updating
- only update containers with the label `com.centurylinklabs.watchtower.enable=true`

Manual update flow:

```bash
docker compose pull
docker compose up -d
```

## Common Commands

Start:

```bash
docker compose up -d
```

Stop:

```bash
docker compose down
```

Restart one service:

```bash
docker compose restart traefik
docker compose restart anki-desktop
docker compose restart navidrome
docker compose restart spotify-lyrics-api
```

View logs:

```bash
docker compose logs -f
```

## Troubleshooting

### Certificates are not being issued

Check:

- DNS for all configured hostnames points to the VPS public IP
- ports `80` and `443` are reachable from the internet
- `traefik/acme.json` exists and is mode `600`
- Traefik logs for ACME challenge errors:

```bash
docker compose logs traefik
```

### `docker compose` fails because env files are missing

Make sure these files exist:

- `.env-anki`
- `.env-lyrics`
- `.env-navidrome`

The `.example` files are templates only and are not loaded automatically by Compose.

If Navidrome starts but your library is empty, make sure `./music` contains supported audio files and restart the service:

```bash
docker compose restart navidrome
```

### Anki UI loads but login fails

Verify the runtime values in `.env-anki`:

- `CUSTOM_USER`
- `PASSWORD`

Then restart the Anki service:

```bash
docker compose restart anki-desktop
```

### Anki API or lyrics API returns the wrong route

This stack depends on Traefik stripping the `/api` prefix before proxying upstream. If requests fail, inspect the router and middleware labels in [`docker-compose.yml`](./docker-compose.yml).

## Notes

- `traefik/acme.json` contains sensitive certificate/account state. Keep it private and do not hand-edit it while Traefik is running.
- Persistent Anki data is stored under `./volumes/anki_data`.
- Persistent Navidrome state is stored under `./volumes/navidrome_data`.
- The music catalog served by Navidrome is read from `./music`.
- The Traefik dashboard is intentionally not exposed.
