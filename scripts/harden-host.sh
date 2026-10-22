#!/usr/bin/env bash
# Run on this VPS after reviewing the allowed public ports. Reboot separately.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo" >&2
  exit 1
fi
stack_dir="$(cd "$(dirname "$0")/.." && pwd)"

cat > /etc/ssh/sshd_config.d/00-vps-security.conf <<'SSH'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
MaxAuthTries 3
LoginGraceTime 30
SSH
sshd -t
systemctl reload ssh

# Host filtering complements the cloud firewall. Docker-published ports still
# need deliberate Compose bindings because Docker forwarding bypasses UFW.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 25565/tcp
ufw allow 41641/udp
ufw allow in on tailscale0
ufw --force enable

if ! findmnt -rn -t nfs,nfs4 >/dev/null; then
  systemctl disable --now rpcbind.socket rpcbind.service
fi

for name in anki lyrics navidrome shigoto kashi sure sure-db; do
  file="$stack_dir/.env-$name"
  if [ -f "$file" ]; then chmod 600 "$file"; fi
done
if [ -f /home/ubuntu/minecraft-server/.env ]; then
  chmod 600 /home/ubuntu/minecraft-server/.env
fi

# Bound new container logs without changing unrelated daemon settings.
python3 - <<'PY'
import json
from pathlib import Path
p = Path('/etc/docker/daemon.json')
d = json.loads(p.read_text()) if p.exists() else {}
d['log-driver'] = 'json-file'
d['log-opts'] = {'max-size': '10m', 'max-file': '5'}
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps(d, indent=2) + '\n')
PY
dockerd --validate --config-file /etc/docker/daemon.json
systemctl enable docker.service
