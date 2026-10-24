import { defineConfig } from "vitest/config";
export default defineConfig({
  tsconfig: "./node_modules/expo/tsconfig.base.json",
  test: { include: ["src/**/*.test.ts"] },
});
