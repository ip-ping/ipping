import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The logic that does not need a browser: geometry, grouping, export, series. Components are checked
// against a running stack by the scripts in tests/ui.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
