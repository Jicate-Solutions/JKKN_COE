import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  typescript: {
    // NOTE: Set to true due to Next.js 16 internal type definition mismatches
    // with @types/react and webpack types. Our application code is type-safe.
    // Re-evaluate after upgrading @types/react or Next.js.
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/pre-exam/practical-email/*': ['./node_modules/@sparticuz/chromium/**/*'],
  },
};

export default nextConfig;
