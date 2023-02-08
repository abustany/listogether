import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import solidPlugin from "vite-plugin-solid";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    wasm(),
    solidPlugin(),
    VitePWA({
      manifest: {
        name: "Listogether",
        short_name: "Listogether",
        description: "Collaborative todo lists",
        background_color: "#dddddd",
        theme_color: "#dddddd",
        display: "standalone",
        icons: [{ src: "icon_512.png", sizes: "512x512", type: "image/png" }],
      },
      srcDir: "src",
      filename: "sw.ts",
      base: "/",
      strategies: "injectManifest",
      injectManifest: {
        additionalManifestEntries: [],
      },
      workbox: {
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      "/api/v1/document/sync": {
        target: "ws://127.0.0.1:8789",
        ws: true,
      },
      "/api": "http://127.0.0.1:8789",
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ["@automerge/automerge-wasm"],
  },
});
