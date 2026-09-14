import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3000", headless: true },
  webServer: {
    command: "python3 -m http.server 3000 --bind 127.0.0.1 --directory out",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    stderr: "ignore",
    stdout: "ignore",
  },
  reporter: "list",
});
