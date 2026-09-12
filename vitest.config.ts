import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Entry points are event wiring; their behaviour is covered through the
      // modules they delegate to.
      exclude: ["src/background/index.ts", "src/popup/index.ts", "src/popup/dom.ts"],
      reporter: ["text", "html"],
    },
  },
});
