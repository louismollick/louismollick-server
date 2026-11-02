// Password gate and static file server for happy-travels.louismollick.com.
//
// Traefik sends every request for the host here, and this process is the only
// thing that can read the site files. A request without a valid session cookie
// never reaches serveFile(), so all it can get is the login page.
//
// The files in /site are shipped by the site's own repo. Secrets come from
// .env-happy-travels, written by set-password.py.
import { createHmac, scrypt, timingSafeEqual } from "node:crypto"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join } from "node:path"
import { pipeline } from "node:stream/promises"
import { promisify } from "node:util"

const SITE = "/site"
const PORT = 8080
const COOKIE = "__Host-session"
const SESSION_SECONDS = 365 * 24 * 60 * 60
const MAX_LOGIN_BYTES = 4096

const hashPassword = promisify(scrypt)

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set, run set-password.py`)
  return value
}

const passwordSalt = Buffer.from(requireEnv("PASSWORD_SALT"), "hex")
const passwordHash = Buffer.from(requireEnv("PASSWORD_HASH"), "hex")
const sessionSecret = requireEnv("SESSION_SECRET")

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".ktx2": "image/ktx2",
  ".map": "application/json",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
}

const sign = (expires) => createHmac("sha256", sessionSecret).update(expires).digest("base64url")

// A session is "<expiry in ms>.<signature>", so nothing is stored server side.
function createSession() {
  const expires = String(Date.now() + SESSION_SECONDS * 1000)
  return `${expires}.${sign(expires)}`
}

function hasValidSession(req) {
  const cookie = req.headers.cookie?.split(/;\s*/).find((part) => part.startsWith(`${COOKIE}=`))
  if (!cookie) return false
  const [expires, signature = ""] = cookie.slice(COOKIE.length + 1).split(".")
  const actual = Buffer.from(signature)
  const expected = Buffer.from(sign(expires))
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected) &&
    Number(expires) > Date.now()
  )
}

const loginPage = (wrongPassword) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<title>Password</title>
<style>
  html, body { height: 100%; margin: 0; background: #000; color: #fff; }
  body { display: grid; place-items: center; font: 20px/1.4 system-ui, -apple-system, sans-serif; }
  form { display: grid; gap: 12px; width: min(320px, 100vw - 48px); }
  input, button { font: inherit; box-sizing: border-box; width: 100%; padding: 14px 16px; border-radius: 8px; }
  input { background: #000; color: #fff; border: 1px solid #fff; }
  button { background: #fff; color: #000; border: 1px solid #fff; cursor: pointer; }
  p { margin: 0; text-align: center; }
</style>
</head>
<body>
<form method="post" action="/login">
  <input type="password" name="password" aria-label="Password" placeholder="Password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" autofocus required>
  <button>Enter</button>
  ${wrongPassword ? '<p role="alert">Wrong password</p>' : ""}
</form>
</body>
</html>
`

function sendLoginPage(res, status, wrongPassword) {
  res.writeHead(status, { "Content-Type": MIME_TYPES[".html"], "Cache-Control": "no-store" })
  res.end(loginPage(wrongPassword))
}

function redirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, "Cache-Control": "no-store", ...headers })
  res.end()
}

function sendStatus(res, status) {
  res.writeHead(status, { "Content-Type": MIME_TYPES[".txt"], "Cache-Control": "no-store" })
  res.end(`${status}\n`)
}

// Traefik rate limits this route. Every attempt also costs a scrypt hash.
async function handleLogin(req, res) {
  let body = ""
  for await (const chunk of req) {
    body += chunk
    if (body.length > MAX_LOGIN_BYTES) return sendStatus(res, 413)
  }
  const password = new URLSearchParams(body).get("password") ?? ""
  const hash = await hashPassword(password, passwordSalt, passwordHash.length)
  if (!timingSafeEqual(hash, passwordHash)) return sendLoginPage(res, 401, true)
  const cookie = `${COOKIE}=${createSession()}; Max-Age=${SESSION_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Lax`
  redirect(res, "/", { "Set-Cookie": cookie })
}

// Only call this after hasValidSession().
async function serveFile(req, res, urlPath) {
  if (req.method !== "GET" && req.method !== "HEAD") return sendStatus(res, 405)

  let relativePath
  try {
    relativePath = decodeURIComponent(urlPath)
  } catch {
    return sendStatus(res, 400)
  }
  if (relativePath.endsWith("/")) relativePath += "index.html"
  const filePath = join(SITE, relativePath)
  if (!filePath.startsWith(`${SITE}/`) || filePath.includes("\0")) return sendStatus(res, 404)

  const file = await stat(filePath).catch(() => null)
  if (!file?.isFile()) return sendStatus(res, 404)

  const etag = `"${file.size}-${file.mtimeMs}"`
  // Vite hashes everything in /assets, so those names never change content.
  const cacheControl = urlPath.startsWith("/assets/")
    ? "private, max-age=31536000, immutable"
    : "private, no-cache"
  const headers = { ETag: etag, "Cache-Control": cacheControl }
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers)
    return res.end()
  }

  res.writeHead(200, {
    ...headers,
    "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": file.size,
  })
  if (req.method === "HEAD") return res.end()
  await pipeline(createReadStream(filePath), res)
}

async function handle(req, res) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow")
  // The raw path, so "/login" here always means the route Traefik rate limits.
  const urlPath = req.url.split("?")[0]
  const signedIn = hasValidSession(req)

  if (urlPath === "/login") {
    if (signedIn) return redirect(res, "/")
    if (req.method === "POST") return handleLogin(req, res)
    return sendLoginPage(res, 200, false)
  }
  if (!signedIn) return redirect(res, "/login")
  return serveFile(req, res, urlPath)
}

const server = createServer((req, res) => {
  handle(req, res).catch(() => {
    if (res.headersSent) res.destroy()
    else sendStatus(res, 500)
  })
})

server.listen(PORT)
process.on("SIGTERM", () => process.exit(0))
