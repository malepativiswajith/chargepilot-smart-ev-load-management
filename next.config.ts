import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["mysql2", "mongodb", "bcryptjs"],
};

export default nextConfig;
