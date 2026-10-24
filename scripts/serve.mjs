// Server lokal sederhana untuk mencoba hasil build: node scripts/serve.mjs  -> http://localhost:8080
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const port = process.env.PORT || 8080;

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(dist + path.replace(/^\//, ""));
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("Tidak ditemukan");
  }
}).on("error", e => {
  if (e.code !== "EADDRINUSE") throw e;
  console.log(`Port ${port} sudah dipakai, kemungkinan server ini sudah berjalan. Buka saja http://localhost:${port}, atau jalankan dengan port lain: PORT=8082 node scripts/serve.mjs`);
  process.exit(1);
}).listen(port, () => console.log(`Buka http://localhost:${port}`));
