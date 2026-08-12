import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const isGitHubPages = process.env.BUILD_GITHUB_PAGES === "true" && Boolean(repositoryName);
const basePath = isGitHubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  reactStrictMode: true,
};

export default nextConfig;
