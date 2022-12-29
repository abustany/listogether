import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [wasm(), solidPlugin()],
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    exclude: ["@automerge/automerge-wasm"],
  },
});
