import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "AUTOKEEP_");
  return {
    plugins: [react()],
    publicDir: "../../docs",
    server: {
      port: 5173,
      proxy: { "/api": { target: env.AUTOKEEP_API_PROXY_TARGET || "http://localhost:3000", changeOrigin: true } },
    },
  };
});
