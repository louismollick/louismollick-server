# Minecraft Server

This directory contains the non-sensitive deployment config for the separate Minecraft server stack running alongside the main reverse-proxy stack.

## Included

- `compose.yml`: Paper server + daily backup sidecar
- `.env.example`: placeholder for the required RCON password
- `.gitignore`: excludes runtime secrets and persistent world/backup data

## Runtime Notes

- Java Edition server
- Paper latest stable image via `itzg/minecraft-server`
- Host port `25565/tcp`
- Memory cap `3G`
- Tuned for `5` concurrent players
- Online mode enabled
- Whitelist enabled
- Operators: `Ruiisuuu`
- Whitelisted players: `Ruiisuuu`, `azerX420`, `Eskodas`
- Daily backups retained for `14` days

## Deploy

Create the runtime secret file:

```bash
cp .env.example .env
```

Set a strong `RCON_PASSWORD`, then start:

```bash
docker compose -f minecraft-server/compose.yml up -d
```

If you deploy from inside this directory instead:

```bash
cd minecraft-server
docker compose up -d
```

## Required Manual Infra

Open cloud ingress for `25565/tcp`.

Players connect to `168.138.74.194:25565`.

## Host-Level Changes Not Stored Here

- `louismollick-server-anki-desktop-1` was stopped temporarily to free RAM
- a `2G` swapfile was added on the server

Those are operational changes on the host, not repo config.
