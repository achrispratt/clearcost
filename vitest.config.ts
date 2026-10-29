import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    exclude: [
      "e2e/**",
      "node_modules/**",
      "**/.claude/**",
      "**/.worktrees/**",
      "**/worktrees/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
