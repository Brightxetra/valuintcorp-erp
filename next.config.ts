import type { NextConfig } from "next";
import {
  assertProductionEnvironment,
  shouldEnforceProductionEnvironment,
} from "./src/lib/config/deployment-environment";

if (shouldEnforceProductionEnvironment(process.env)) {
  assertProductionEnvironment(process.env, "Next.js production build");
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
