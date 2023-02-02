import { precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// self.__WB_MANIFEST is default injection point
precacheAndRoute(self.__WB_MANIFEST);

// see https://github.com/vite-pwa/docs/blob/95f21b7d2633714afcd20f25a582b1e80cd06eb8/guide/inject-manifest.md#prompt-for-update-behavior
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
