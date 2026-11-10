import type { NextConfig } from "next";

const githubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(githubPages ? {
    output: "export",
    basePath: "/soup-tz",
    trailingSlash: true,
    images: { unoptimized: true },
  } : {}),
};

export default nextConfig;
