/// <reference lib="webworker" />
// Custom service worker (injectManifest). Push notification handlers are added in phase 6.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | PrecacheEntry)[] };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Serve the app shell for every in-app navigation so deep links work offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// The page asks us to activate after the user taps "Reload".
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
