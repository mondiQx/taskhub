import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const devServerPort = process.env.SERVER_PORT ?? 4173;

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/api": `http://localhost:${devServerPort}`,
      "/ws": {
        target: `ws://localhost:${devServerPort}`,
        ws: true,
      },
    },
  },
});
