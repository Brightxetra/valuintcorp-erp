import type { NextConfig } from "next";
import { assertProductionEnvironment } from "./src/lib/config/deployment-environment";

assertProductionEnvironment(process.env, "Next.js production build");

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
