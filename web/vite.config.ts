import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
    proxy: { "/api": process.env.API_PROXY_URL ?? "http://127.0.0.1:8000" },
  },
  build: { sourcemap: true },
});
