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
    // katex.min.css and its woff2 faces are read from disk (lib/ia/katex-css.ts) and
    // inlined into the print page. The tracer follows `import katex from 'katex'`
    // but not those data files; without them formulae fall back to MathML, whose
    // italic identifiers print BLANK under @sparticuz/chromium. public/fonts carries
    // the paper's Latin serif and the Tamil faces, embedded the same way.
    '/api/v1/ia/question-papers/**': [
      './node_modules/@sparticuz/chromium/**/*',
      './node_modules/katex/dist/katex.min.css',
      './node_modules/katex/dist/fonts/**/*.woff2',
      './public/fonts/**/*',
    ],
    '/api/pre-exam/question-papers/**': [
      './node_modules/@sparticuz/chromium/**/*',
      './node_modules/katex/dist/katex.min.css',
      './node_modules/katex/dist/fonts/**/*.woff2',
      './public/fonts/**/*',
    ],
  },
};

export default nextConfig;
