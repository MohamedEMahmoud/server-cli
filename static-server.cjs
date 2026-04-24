const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const port = Number(process.env.PORT || 4989);
const host =
  process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const rootDir = process.env.STATIC_ROOT
  ? path.resolve(process.env.STATIC_ROOT)
  : path.resolve(__dirname, "out");

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".eot", "application/vnd.ms-fontobject"],
  [".map", "application/json; charset=utf-8"],
]);

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function safeJoin(base, target) {
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  return resolved;
}

function fileExists(p) {
  try {
    const st = fs.statSync(p);
    return st.isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    const st = fs.statSync(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  if (!req.url) return send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad Request");

  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname || "/");
  if (!pathname.startsWith("/")) pathname = "/" + pathname;

  const joined = safeJoin(rootDir, "." + pathname);
  if (!joined) return send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");

  let candidate = joined;

  // If directory, serve index.html
  if (dirExists(candidate)) candidate = path.join(candidate, "index.html");

  // Next static export can produce route.html files (e.g. /auth/login -> /auth/login.html).
  if (!path.extname(candidate) && !fileExists(candidate) && fileExists(`${candidate}.html`)) {
    candidate = `${candidate}.html`;
  }

  // SPA fallback: if nothing matches, serve root index.html
  if (!path.extname(candidate) && !fileExists(candidate)) {
    candidate = path.join(rootDir, "index.html");
  }

  // Final check
  if (!fileExists(candidate)) {
    return send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found");
  }

  const ext = path.extname(candidate).toLowerCase();
  const contentType = mime.get(ext) || "application/octet-stream";

  try {
    const stat = fs.statSync(candidate);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable");
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(candidate).pipe(res);
  } catch (e) {
    return send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, "Internal Server Error");
  }
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Static server listening on http://${host}:${port} (root: ${rootDir})`);
});

