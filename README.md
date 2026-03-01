# Personal VPS Reverse Proxy Stack

This repository contains a Docker Compose stack for running personal services behind Traefik with automatic HTTPS from Let's Encrypt.

Current services:

- `https://anki.louismollick.com/` -> Anki desktop via KasmVNC
- `https://anki.louismollick.com/api` -> AnkiConnect API
- `https://lyrics.louismollick.com/` -> Lyricsu web app
- `https://spotify-lyrics-api.louismollick.com/` -> Spotify lyrics API

Traefik is the only public entrypoint. It listens on ports `80` and `443`, redirects HTTP to HTTPS, and stores ACME certificate state in `traefik/acme.json`.

## Requirements

Before starting:

- Ubuntu VPS with Docker Engine installed
- Docker Compose plugin installed (`docker compose`)
- DNS records pointing at the VPS public IP:
  - `anki.louismollick.com`
  - `lyrics.louismollick.com`
  - `spotify-lyrics-api.louismollick.com`
- Ports `80/tcp` and `443/tcp` open in the VPS firewall / cloud security group

## Files In This Repo

- [`docker-compose.yml`](/Users/mollicl/personal/louismollick-server/docker-compose.yml): main stack definition
- [`/.env-anki.example`](/Users/mollicl/personal/louismollick-server/.env-anki.example): example runtime variables for Anki
- [`/.env-lyrics.example`](/Users/mollicl/personal/louismollick-server/.env-lyrics.example): example runtime variables for lyrics API
- [`/.env-lyricsu.example`](/Users/mollicl/personal/louismollick-server/.env-lyricsu.example): example runtime variables for the lyrics UI
- [`/secrets/youtube-cookies.txt`](/Users/mollicl/personal/louismollick-server/secrets/youtube-cookies.txt): local-only YouTube cookies file mounted into the `lyricsu` container (create this yourself; it is gitignored)
- [`/traefik/acme.json`](/Users/mollicl/personal/louismollick-server/traefik/acme.json): runtime ACME state file created locally on the server
- [`/volumes/anki_data`](/Users/mollicl/personal/louismollick-server/volumes/anki_data): persistent Anki data

## Getting Started

### 1. Create runtime env files

Copy the committed examples into real runtime files:

```bash
cp .env-anki.example .env-anki
cp .env-lyrics.example .env-lyrics
cp .env-lyricsu.example .env-lyricsu
```

Then edit them:

- In `.env-anki`:
  - Set `PASSWORD` to a long random password
  - Optionally set `ANKIWEB_USER` plus either `ANKIWEB_PASSWORD` or `ANKIWEB_SYNC_KEY`
  - Adjust `TZ` if you do not want `UTC`
- In `.env-lyrics`:
  - Set `SP_DC` to your Spotify `sp_dc` cookie value
- In `.env-lyricsu`:
  - Set `SPOTIFY_CLIENT_ID` to your Spotify application client ID
  - Set `SPOTIFY_CLIENT_SECRET` to your Spotify application client secret

### 1b. Add the YouTube cookies file for Lyricsu

Create the secrets directory and place a fresh Netscape-format `cookies.txt` export at:

```bash
mkdir -p secrets
cp /path/to/cookies.txt secrets/youtube-cookies.txt
chmod 600 secrets/youtube-cookies.txt
```

The `lyricsu` service mounts this file into the container at `/app/secrets/youtube-cookies.txt`, and both `yt-dlp` and `youtubei.js` read from it.

To generate that file, use the `yt-dlp` browser-export flow described in the official guide:

- [yt-dlp FAQ: How do I pass cookies to yt-dlp?](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp)

The practical export flow is:

```bash
yt-dlp --cookies-from-browser firefox --cookies /tmp/youtube-cookies.txt --skip-download "https://music.youtube.com/watch?v=X217TdX27fk"
```

Then copy the generated file to `secrets/youtube-cookies.txt` on the VPS.

Runtime files `.env-anki`, `.env-lyrics`, and `.env-lyricsu` are ignored by git.
The `secrets/` directory is also ignored by git.

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
- `lyricsu`: lyrics UI on internal port `3000`, configured to call the local `spotify-lyrics-api` container
  - Also mounts `./secrets/youtube-cookies.txt` into `/app/secrets/youtube-cookies.txt` for YouTube metadata/media access
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
- `https://lyrics.louismollick.com/`
- `https://anki.louismollick.com/api`
- `https://spotify-lyrics-api.louismollick.com/`

Expected behavior:

- `http://` requests redirect to `https://`
- `https://anki.louismollick.com/` loads the Anki KasmVNC page
- `https://lyrics.louismollick.com/` loads the Lyricsu UI
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
docker compose restart lyricsu
docker compose restart spotify-lyrics-api
```

View logs:

```bash
docker compose logs -f
```

## Troubleshooting

### Certificates are not being issued

Check:

- DNS for both subdomains points to the VPS public IP
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
- `.env-lyricsu`
- `secrets/youtube-cookies.txt`

The `.example` files are templates only and are not loaded automatically by Compose.

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
- The Traefik dashboard is intentionally not exposed.
