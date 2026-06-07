import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN;

const nextConfig: NextConfig = {
  serverExternalPackages: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  async rewrites() {
    if (!apiOrigin) {
      return [];
    }

    return {
      beforeFiles: [
        // Proxy /api/uploads/presigned (and any future sub-routes) to EC2
        // Uses :subpath+ so it only matches paths WITH a sub-segment, not /api/uploads itself
        {
          source: "/api/uploads/:subpath+",
          destination: `${apiOrigin}/api/uploads/:subpath*`,
        },
        // Proxy all other /api/* routes to EC2, except /api/uploads (Vercel Blob handler)
        {
          source: "/api/:path((?!uploads).*)",
          destination: `${apiOrigin}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
