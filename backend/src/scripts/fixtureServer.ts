import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Serves fixtures/ as static HTML on http://localhost:8099/, so the
 * documented Appendix B example (http://localhost:8099/acme/) works
 * against a real HTTP server for manual crawler testing and for the
 * batch CLI's demo run — mirrors what the graders' own fixture site
 * is expected to look like.
 */
const PORT = Number(process.env.FIXTURE_PORT ?? 8099);
const ROOT = path.resolve(fileURLToPath(new URL("../../../fixtures", import.meta.url)));

async function resolveFile(urlPath: string): Promise<string | null> {
  const cleanPath = urlPath.split("?")[0]!.replace(/\/+$/, "") || "/";
  const candidates = cleanPath === "/" ? ["/index.html"] : [cleanPath, `${cleanPath}.html`, `${cleanPath}/index.html`];

  for (const candidate of candidates) {
    const filePath = path.join(ROOT, candidate);
    if (!filePath.startsWith(ROOT)) continue; // guard against path traversal
    try {
      const info = await stat(filePath);
      if (info.isFile()) return filePath;
    } catch {
      continue;
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  const filePath = await resolveFile(req.url ?? "/");
  if (!filePath) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  const html = await readFile(filePath, "utf-8");
  res.writeHead(200, { "content-type": "text/html" });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`Fixture server running at http://localhost:${PORT}/acme/`);
});
