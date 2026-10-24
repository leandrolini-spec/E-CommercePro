import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El logo se sube con un formulario (hasta 2 MB).
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;
