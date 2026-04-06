/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  },
};

export default nextConfig;
