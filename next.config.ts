import type { NextConfig } from "next";

// In production a reverse proxy (Caddy, see compose.yaml) sends /api/* straight to the backend
// and everything else here. This rewrite only exists so `npm run dev` and a bare `npm start`
// can reach a backend without one. It is fixed at build time.
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // The app never uses next/image, so skip the image optimiser. That keeps `sharp`, the only
  // platform-specific binary Next would trace into the standalone output, out of it, which makes
  // the build identical on every CPU architecture (the Dockerfile relies on this).
  images: { unoptimized: true },
  outputFileTracingExcludes: { "*": ["node_modules/sharp/**", "node_modules/@img/**"] },
  // Tailwind v4 is applied to CSS by its Turbopack loader (this is what create-next-app set up).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
