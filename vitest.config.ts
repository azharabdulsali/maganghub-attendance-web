import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Klien Prisma hasil generate bukan kode kita, jangan ikut dicari.
    exclude: ["node_modules/**", "src/generated/**", ".next/**"],
  },
});
