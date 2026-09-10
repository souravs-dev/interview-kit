import { describe, expect, it } from "vitest";
import { assertFetchableUrl, BlockedUrlError } from "../ssrfGuard.js";

describe("assertFetchableUrl", () => {
  describe("in production", () => {
    const prod = { nodeEnv: "production" };

    it("rejects loopback IP literals (AC-019)", async () => {
      await expect(assertFetchableUrl("http://127.0.0.1:9999/", prod)).rejects.toThrow(BlockedUrlError);
    });

    it("rejects the cloud metadata link-local address", async () => {
      await expect(assertFetchableUrl("http://169.254.169.254/latest/meta-data/", prod)).rejects.toThrow(BlockedUrlError);
    });

    it("rejects RFC1918 private ranges (10.x, 172.16-31.x, 192.168.x)", async () => {
      await expect(assertFetchableUrl("http://10.0.0.5/", prod)).rejects.toThrow(BlockedUrlError);
      await expect(assertFetchableUrl("http://172.16.0.5/", prod)).rejects.toThrow(BlockedUrlError);
      await expect(assertFetchableUrl("http://192.168.1.5/", prod)).rejects.toThrow(BlockedUrlError);
    });

    it("rejects the IPv6 loopback address", async () => {
      await expect(assertFetchableUrl("http://[::1]/", prod)).rejects.toThrow(BlockedUrlError);
    });

    it("permits a public IP literal", async () => {
      const result = await assertFetchableUrl("http://8.8.8.8/", prod);
      expect(result.resolvedIp).toBe("8.8.8.8");
    });

    it("rejects non-http(s) protocols", async () => {
      await expect(assertFetchableUrl("ftp://8.8.8.8/", prod)).rejects.toThrow(BlockedUrlError);
    });

    it("rejects a malformed URL", async () => {
      await expect(assertFetchableUrl("not a url", prod)).rejects.toThrow(BlockedUrlError);
    });
  });

  describe("outside production (dev/test)", () => {
    const dev = { nodeEnv: "test" };

    it("permits the documented Appendix B localhost fixture (AC-020)", async () => {
      // "localhost" may resolve to 127.0.0.1 or ::1 depending on the host's
      // resolver configuration — either is a valid loopback address, so
      // assert on that property rather than a specific literal.
      const result = await assertFetchableUrl("http://localhost:8099/acme/", dev);
      expect(["127.0.0.1", "::1"]).toContain(result.resolvedIp);
    });

    it("permits a loopback IP literal", async () => {
      const result = await assertFetchableUrl("http://127.0.0.1:8099/", dev);
      expect(result.resolvedIp).toBe("127.0.0.1");
    });

    it("still rejects non-http(s) protocols even outside production", async () => {
      await expect(assertFetchableUrl("file:///etc/passwd", dev)).rejects.toThrow(BlockedUrlError);
    });
  });

  it("defaults to process.env.NODE_ENV when no option is passed", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(assertFetchableUrl("http://127.0.0.1/")).rejects.toThrow(BlockedUrlError);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
