import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.DEV_API_PROXY_TARGET
    ? new URL(env.DEV_API_PROXY_TARGET)
    : null;
  const proxyBasePath = proxyTarget?.pathname.replace(/\/$/, "") ?? "";

  return {
    plugins: [react()],
    server: proxyTarget
      ? {
          proxy: {
            "/api": {
              target: proxyTarget.origin,
              changeOrigin: true,
              secure: true,
              rewrite: (path) =>
                `${proxyBasePath}${path.replace(/^\/api/, "")}`,
            },
          },
        }
      : undefined,
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
