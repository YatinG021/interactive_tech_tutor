import path from "node:path";
import type { NextConfig } from "next";

// The site is a static export so it can be hosted on GitHub Pages. Every page is a client page that
// talks to the Azure API, so no Node server is needed. NEXT_PUBLIC_BASE_PATH is "/<repo>" on Pages
// and empty locally. (Cache Components needs a Node server, so it is not enabled here.)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    // This app has its own lockfile inside a larger repo; pin the root so Turbopack does not guess.
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css"
      }
    }
  }
};

export default nextConfig;
