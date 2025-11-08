import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Warning or error will still show in the console, but won't stop the build
    ignoreDuringBuilds: true,
  },

  typescript: {
    // Will still show errors in the console, but will compile anyway
    ignoreBuildErrors: true,
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
