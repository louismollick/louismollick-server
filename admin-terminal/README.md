# Admin terminal

This service exposes a browser terminal for administering the VPS through Cloudflare Tunnel and Cloudflare Access.

The terminal is intentionally powerful. The container is privileged, joins the host PID and network namespaces, and uses `nsenter` to open a login shell as the host's `ubuntu` user. Treat access to the terminal as equivalent to SSH access to the VPS.

The terminal itself listens only on `127.0.0.1:7681`. Do not publish port 7681 in Docker, OCI security lists, UFW, or any other firewall. The intended path is:

```
browser -> Cloudflare Access -> Cloudflare Tunnel -> 127.0.0.1:7681 -> ttyd -> host shell
```

## Runtime configuration

Create the tunnel token file:

```bash
cp .env-cloudflared.example .env-cloudflared
```

Set `TUNNEL_TOKEN` to the token for a remotely-managed Cloudflare Tunnel.

In Cloudflare, publish a hostname such as `terminal.louismollick.com` and point it to:

```
http://localhost:7681
```

Create a Cloudflare Access self-hosted application for the same hostname before making the route available.

## Start

```bash
docker compose up -d --build admin-terminal cloudflared
```

Verify locally on the VPS:

```bash
curl -I http://127.0.0.1:7681
docker compose ps admin-terminal cloudflared
docker compose logs --tail=100 admin-terminal cloudflared
```

No inbound OCI firewall rule is required for the tunnel. `cloudflared` makes the connection outbound to Cloudflare.
