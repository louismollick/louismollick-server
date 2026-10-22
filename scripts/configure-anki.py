#!/usr/bin/env python3
"""Generate a private API key once and restrict the deployed reader's origin."""
import json
import re
import secrets
from pathlib import Path

path = Path(__file__).resolve().parent.parent / '.env-anki'
lines = path.read_text().splitlines()
values = dict(line.split('=', 1) for line in lines if re.match(r'^[A-Z_]+=', line))
key = values.get('ANKICONNECT_API_KEY', '').strip().strip('"\'')
if len(key) < 32:
    key = secrets.token_hex(32)
updates = {
    'ANKICONNECT_API_KEY': key,
    'ANKICONNECT_CORS_ORIGIN': json.dumps(['https://mokuro-reader-louis.vercel.app']),
}
output = [line for line in lines if not any(line.startswith(name + '=') for name in updates)]
output.extend(name + '=' + value for name, value in updates.items())
path.chmod(0o600)
path.write_text('\n'.join(output) + '\n')
print('Anki API key configured in .env-anki; allowed origin is https://mokuro-reader-louis.vercel.app')
