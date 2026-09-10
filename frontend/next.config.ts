import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // This project already has a root CLAUDE.md governing the whole monorepo —
  // don't let Next.js regenerate a conflicting nested one on every dev/build.
  agentRules: false,
};

export default nextConfig;
