/** @type {import('next').NextConfig} */
// Production: a static export (web/out) that FastAPI serves itself, so one
// Railway service. During `next dev` that export does not exist; then a
// rewrite forwards /api/* to the local FastAPI on port 8000.
const dev = process.env.NODE_ENV === "development";

module.exports = dev
  ? {
      async rewrites() {
        return [{ source: "/api/:path*", destination: "http://localhost:8000/api/:path*" }];
      },
    }
  : {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
    };
