import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpFetchAdapter } from "../HttpFetchAdapter.js";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  server = createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>hello</body></html>");
    } else if (req.url === "/redirect") {
      res.writeHead(302, { location: "/ok" });
      res.end();
    } else if (req.url === "/wrong-type") {
      res.writeHead(200, { "content-type": "application/pdf" });
      res.end("not html");
    } else if (req.url === "/too-big") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("x".repeat(10_000));
    } else if (req.url === "/not-found") {
      res.writeHead(404);
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("HttpFetchAdapter", () => {
  it("fetches a page successfully outside production", async () => {
    const adapter = new HttpFetchAdapter({ nodeEnv: "test" });
    const page = await adapter.fetch(`${baseUrl}/ok`);
    expect(page.status).toBe(200);
    expect(page.contentType).toBe("text/html");
    expect(page.html).toContain("hello");
  });

  it("follows a redirect and re-resolves to the final URL", async () => {
    const adapter = new HttpFetchAdapter({ nodeEnv: "test" });
    const page = await adapter.fetch(`${baseUrl}/redirect`);
    expect(page.url).toBe(`${baseUrl}/ok`);
    expect(page.html).toContain("hello");
  });

  it("rejects a disallowed content-type", async () => {
    const adapter = new HttpFetchAdapter({ nodeEnv: "test" });
    await expect(adapter.fetch(`${baseUrl}/wrong-type`)).rejects.toThrow(/content-type/);
  });

  it("rejects a response exceeding the configured size limit", async () => {
    const adapter = new HttpFetchAdapter({ nodeEnv: "test", maxBytes: 1000 });
    await expect(adapter.fetch(`${baseUrl}/too-big`)).rejects.toThrow(/exceeded max size/);
  });

  it("accepts a response under the size limit", async () => {
    const adapter = new HttpFetchAdapter({ nodeEnv: "test" });
    const page = await adapter.fetch(`${baseUrl}/too-big`);
    expect(page.html.length).toBe(10_000);
  });

  it("rejects a 404 as a fetch failure", async () => {
    const adapter = new HttpFetchAdapter({ nodeEnv: "test" });
    await expect(adapter.fetch(`${baseUrl}/not-found`)).rejects.toThrow(/404/);
  });

  it("blocks loopback fetches in production via the SSRF guard (AC-019)", async () => {
    const adapter = new HttpFetchAdapter({ nodeEnv: "production" });
    await expect(adapter.fetch(`${baseUrl}/ok`)).rejects.toThrow(/Blocked/);
  });

  it("permits loopback fetches outside production (AC-020)", async () => {
    const adapter = new HttpFetchAdapter({ nodeEnv: "development" });
    const page = await adapter.fetch(`${baseUrl}/ok`);
    expect(page.status).toBe(200);
  });
});
