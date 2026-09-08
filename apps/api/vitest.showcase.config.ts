import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../", import.meta.url)),
      "cloudflare:workers": fileURLToPath(
        new URL("./test/showcase/worker-env.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["test/showcase/**/*.spec.ts"],
    testTimeout: 15000,
  },
});
