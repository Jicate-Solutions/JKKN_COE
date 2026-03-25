import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/pre-exam/practical-email/*': ['./node_modules/@sparticuz/chromium/**/*'],
  },
};

export default nextConfig;
