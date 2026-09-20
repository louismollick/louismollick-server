# Admin terminal

This exposes a browser terminal for administering the VPS through Cloudflare Tunnel and Cloudflare Access.

`ttyd` runs directly on the VPS as the existing `ubuntu` user and listens only on `127.0.0.1:7681`. Cloudflare Tunnel is the only intended path to it:

```
browser -> Cloudflare Access -> Cloudflare Tunnel -> 127.0.0.1:7681 -> ttyd -> ubuntu shell
```

Do not publish port 7681 in Docker, OCI security lists, UFW, or any other firewall.

## Install ttyd

On the VPS:

```bash
sudo apt update
sudo apt install -y ttyd
sudo install -m 0644 admin-terminal/ttyd-admin.service /etc/systemd/system/ttyd-admin.service
sudo systemctl daemon-reload
sudo systemctl enable --now ttyd-admin
```

Verify it is listening only on loopback:

```bash
systemctl status ttyd-admin --no-pager
ss -ltnp | grep 7681
curl -I http://127.0.0.1:7681
```

## Configure Cloudflare Tunnel

Create the tunnel token file:

```bash
cp .env-cloudflared.example .env-cloudflared
```

Set `TUNNEL_TOKEN` to the token for a remotely-managed Cloudflare Tunnel, then start the connector:

```bash
docker compose up -d cloudflared
docker compose logs --tail=100 cloudflared
```

In Cloudflare, publish a hostname such as `terminal.louismollick.com` and point it to `http://localhost:7681`. Create a Cloudflare Access self-hosted application for the same hostname before making the route available.

No inbound OCI firewall rule is required for the tunnel. `cloudflared` connects outbound to Cloudflare.
