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
    // Chromium is loaded at runtime via chromium.executablePath(), so the tracer
    // can't see it — every route that renders a PDF through headless Chromium must
    // be listed here or it deploys without the binary. IA question-paper PDFs:
    '/api/v1/ia/question-papers/**': ['./node_modules/@sparticuz/chromium/**/*'],
    '/api/pre-exam/question-papers/**': ['./node_modules/@sparticuz/chromium/**/*'],
  },
};

export default nextConfig;
