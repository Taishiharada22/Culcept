import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // 第 13 補正 #2 反映: render contract test (= .tsx with JSX) を pickup するため拡張子 union
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // server-only は react-server condition 置換前提で非置換環境では throw する。
      // test では no-op stub に解決（production の Next.js bundler 挙動は不変）。
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
