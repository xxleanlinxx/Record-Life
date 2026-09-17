import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { DEVICE_MODE } from "./lib/api";
import "./styles.css";

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

if (DEVICE_MODE) {
  window.addEventListener("record-life-device-change", () => {
    void client.invalidateQueries();
  });
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

// A production preview and Vite development can share the same local origin.
// Remove only our application shell in development; preserve the user's DB.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      await Promise.all(
        registrations
          .filter(
            (r) =>
              r.active?.scriptURL === new URL("/sw.js", location.href).href,
          )
          .map((r) => r.unregister()),
      );
      await Promise.all(
        (await caches.keys())
          .filter((k) => k.startsWith("record-life-shell-"))
          .map((k) => caches.delete(k)),
      );
    })
    .catch(() => {});
}
