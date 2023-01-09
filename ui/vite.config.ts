import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [wasm(), solidPlugin()],
  server: {
    port: 3000,
    proxy: {
      "^/api/v1/document/.*/sync": {
        target: "ws://127.0.0.1:8789",
        ws: true,
      },
      "/api": "http://127.0.0.1:8789",
    },
  },
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    exclude: ["@automerge/automerge-wasm"],
  },
});
