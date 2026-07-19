# Minecraft Server

Minecraft is part of the repository's main Docker Compose stack. This directory documents its configuration; runtime data stays outside the Git checkout.

## Included

- `.env.example`: placeholder for the required RCON password
- `.gitignore`: prevents accidental commits if runtime files are temporarily placed here

Runtime files on the VPS:

- `/home/ubuntu/minecraft-server/.env`: RCON secret
- `/home/ubuntu/minecraft-server/data`: persistent server and world data
- `/home/ubuntu/minecraft-server/backups`: daily backups

## Runtime Notes

- Java Edition server
- Paper `26.2` via `itzg/minecraft-server`
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
cp minecraft-server/.env.example /home/ubuntu/minecraft-server/.env
```

Set a strong `RCON_PASSWORD`, then start Minecraft and its backup service from the repository root:

```bash
docker compose up -d minecraft minecraft-backup
```

The Compose paths default to `/home/ubuntu/minecraft-server`. Set `MINECRAFT_SERVER_DIR` when running Compose to use another location.

## One-Time Migration From The Separate Stack

Before replacing containers from the old `minecraft-server` Compose project:

1. Flush the live world and create a verified backup.
2. Stop and remove only the old `minecraft` and `minecraft-backup` containers. Do not delete bind-mounted directories or use `down --volumes`.
3. Start `minecraft` and `minecraft-backup` from the repository root.
4. Verify both containers use `/home/ubuntu/minecraft-server/data` and `/home/ubuntu/minecraft-server/backups`.

## Required Manual Infra

Open cloud ingress for `25565/tcp`.

Players connect to `168.138.74.194:25565`.

## Host-Level Changes Not Stored Here

- `louismollick-server-anki-desktop-1` was stopped temporarily to free RAM
- a `2G` swapfile was added on the server

Those are operational changes on the host, not repo config.
