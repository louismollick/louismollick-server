#!/usr/bin/env python3
"""Set the happy-travels password. Run from the stack directory on the VPS.

Reads the password from a prompt or stdin and writes .env-happy-travels with a
salted hash and a fresh session secret, so everyone has to log in again. Apply
it with: docker compose up -d --no-deps --force-recreate happy-travels
"""
import getpass
import hashlib
import os
import secrets
import sys

ENV_FILE = ".env-happy-travels"

if sys.stdin.isatty():
    password = getpass.getpass("New password: ").encode()
else:
    password = sys.stdin.buffer.read().rstrip(b"\r\n")
if not password:
    sys.exit("The password is empty, nothing was changed")

salt = secrets.token_bytes(16)
# These are the defaults of Node's crypto.scrypt, which gate.mjs compares with.
password_hash = hashlib.scrypt(password, salt=salt, n=16384, r=8, p=1, dklen=32)

fd = os.open(ENV_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as env:
    env.write(f"PASSWORD_SALT={salt.hex()}\n")
    env.write(f"PASSWORD_HASH={password_hash.hex()}\n")
    env.write(f"SESSION_SECRET={secrets.token_hex(32)}\n")
