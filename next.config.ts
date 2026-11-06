import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its WebAssembly and data files from its own package folder, so it has to run from
  // node_modules rather than be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // PGlite reads the schema from db/migrations at run time (the preview demo), and nothing imports
  // those files, so the server bundle has to be told to include them.
  outputFileTracingIncludes: { "/**": ["./db/migrations/*.sql"] },
};

export default nextConfig;
