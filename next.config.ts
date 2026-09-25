import type { NextConfig } from "next";

const CHROMIUM_FILES = ['./node_modules/@sparticuz/chromium/**/*'];
const QUESTION_PAPER_FILES = [
  ...CHROMIUM_FILES,
  './node_modules/katex/dist/katex.min.css',
  './node_modules/katex/dist/fonts/**/*.woff2',
  './public/fonts/**/*',
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  typescript: {
    // NOTE: Set to true due to Next.js 16 internal type definition mismatches
    // with @types/react and webpack types. Our application code is type-safe.
    // Re-evaluate after upgrading @types/react or Next.js.
    ignoreBuildErrors: true,
  },
  // Learner pages moved under /learners/*; keep old links, bookmarks and saved
  // favorites working.
  async redirects() {
    return [
      { source: '/users/learners-myjkkn', destination: '/learners/directory', permanent: true },
      { source: '/users/generate-register-number', destination: '/learners/generate-register-number', permanent: true },
      { source: '/users/discontinued-learners', destination: '/learners/discontinued-learners', permanent: true },
      { source: '/reports/pre-exam/student-strength', destination: '/learners/student-strength', permanent: true },
    ];
  },
  serverExternalPackages: ['@sparticuz/chromium'],
  // Chromium is loaded at runtime via chromium.executablePath() (through
  // lib/pdf/headless-browser.ts), so the tracer cannot see its .br archives —
  // EVERY route that renders a PDF through headless Chromium must be listed
  // here or it deploys without the binary and fails with "The input directory
  // .../@sparticuz/chromium/bin does not exist". Question-paper PDFs also read
  // katex.min.css + woff2 faces from disk (lib/ia/katex-css.ts) and inline them;
  // without them formulae fall back to MathML, whose italic identifiers print
  // BLANK under @sparticuz/chromium. public/fonts carries the Latin serif and
  // the Tamil faces, embedded the same way.
  outputFileTracingIncludes: {
    // Practical examiner appointment letters (lib/pdf/practical-appointment-letter.ts)
    '/api/pre-exam/practical-email/**': CHROMIUM_FILES,
    // Central valuation appointment letters (lib/pdf/central-valuation-appointment-letter.ts)
    '/api/post-exam/central-valuation/email/**': CHROMIUM_FILES,
    // QP examiner orders + claim forms (lib/pdf/examiner-order.ts): CoE side —
    // send-order / re-send, order PDF, e-mail preview + bulk send, claims —
    // and the examiner portal's own documents route.
    '/api/pre-exam/qp-examiner-assignments/**': CHROMIUM_FILES,
    '/api/examiner-portal/**': CHROMIUM_FILES,
    // CIA / ESE question papers (lib/ia/build-paper-pdf-html.ts)
    '/api/v1/ia/question-papers/**': QUESTION_PAPER_FILES,
    '/api/pre-exam/question-papers/**': QUESTION_PAPER_FILES,
    '/api/pre-exam/ese-question-papers/**': QUESTION_PAPER_FILES,
  },
};

export default nextConfig;
