/** @type {import('next').NextConfig} */
// Productie: een statische export (web/out) die FastAPI zelf serveert, dus één
// Railway-service. Tijdens `next dev` bestaat die export niet; dan stuurt een
// rewrite /api/* door naar de lokale FastAPI op poort 8000.
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
