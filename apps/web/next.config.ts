import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiOrigin) {
      return [];
    }

    return {
      beforeFiles: [
        {
          // Proxy all /api/* routes to EC2, except exact /api/uploads (served by Next.js via Vercel Blob)
          source: "/api/:path((?!uploads$).*)",
          destination: `${apiOrigin}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
