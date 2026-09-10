import { promises as dns } from "node:dns";
import { isIP } from "node:net";

export class BlockedUrlError extends Error {
  constructor(
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/** [network base, prefix length] — includes 169.254.0.0/16 so cloud metadata (169.254.169.254) is covered. */
const PRIVATE_IPV4_RANGES: [string, number][] = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["0.0.0.0", 8],
];

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipToInt(ip);
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ipInt & mask) === (ipToInt(base) & mask);
  });
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

function isPrivateIp(ip: string): boolean {
  return isIP(ip) === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

export interface SsrfGuardOptions {
  /** Defaults to process.env.NODE_ENV. Private/loopback addresses are only permitted when this is not "production" — required so the documented http://localhost:8099/... batch fixture (Appendix B) works from a clean clone. */
  nodeEnv?: string;
}

export interface FetchableUrl {
  url: URL;
  /** The specific IP validated for this hostname — callers (the real fetch adapter, M5) should pin the actual connection to this address to close the DNS-rebinding TOCTOU gap between this check and the request. */
  resolvedIp: string;
}

/**
 * Validates a URL is safe to fetch server-side. Resolves DNS itself and
 * checks the resolved IP(s) — never just the hostname string, since a
 * hostname can resolve to a public IP at check-time and a private one at
 * connect-time (DNS rebinding). Must be called again for every redirect
 * hop by the caller; this function only validates the one URL it's given.
 */
export async function assertFetchableUrl(rawUrl: string, options: SsrfGuardOptions = {}): Promise<FetchableUrl> {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const allowPrivate = nodeEnv !== "production";

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError(`Not a valid URL: ${rawUrl}`, rawUrl);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError(`Unsupported protocol "${url.protocol}" for ${rawUrl}`, rawUrl);
  }

  // WHATWG URL keeps brackets around an IPv6 literal in `.hostname`
  // (e.g. "[::1]") — strip them before treating it as an IP/DNS target.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalVersion = isIP(hostname);
  const resolvedIps = literalVersion ? [hostname] : (await dns.lookup(hostname, { all: true })).map((r) => r.address);

  if (resolvedIps.length === 0) {
    throw new BlockedUrlError(`Could not resolve host: ${hostname}`, rawUrl);
  }

  if (!allowPrivate) {
    for (const ip of resolvedIps) {
      if (isPrivateIp(ip)) {
        throw new BlockedUrlError(`Blocked private/loopback address ${ip} for ${rawUrl} (NODE_ENV=production)`, rawUrl);
      }
    }
  }

  return { url, resolvedIp: resolvedIps[0]! };
}
