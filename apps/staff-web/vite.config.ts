import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  publicDir: "../../public",
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          icons: ["lucide-react"],
          "react-vendor": [
            "@tanstack/react-query",
            "react",
            "react-dom",
            "react-router-dom",
            "socket.io-client",
          ],
        },
      },
    },
  },
  test: { environment: "jsdom" },
});
