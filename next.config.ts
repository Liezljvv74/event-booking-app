import type { NextConfig } from "next";

/**
 * A project page on GitHub Pages is served out of a subdirectory named after
 * the repository, so every asset URL and internal link needs that prefix.
 * The deploy workflow passes it in; `next dev` sets nothing and serves from
 * the root, which is why this is read from the environment rather than
 * written in here.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  /**
   * Build to plain HTML, CSS and JavaScript in `out/`, with no Node server
   * behind it — all a file host like GitHub Pages can serve. The app keeps
   * every event in the browser's own IndexedDB, so it never needed one.
   */
  output: "export",
  basePath,
  /**
   * Emit `tables/index.html` rather than `tables.html`, so a URL resolves
   * whether or not the trailing slash is typed.
   */
  trailingSlash: true,
  /**
   * The default image loader resizes on request, which needs a server.
   * Nothing here uses next/image today; this keeps that from becoming a
   * confusing build failure later.
   */
  images: { unoptimized: true },
};

export default nextConfig;
