import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { StoreProvider } from "./store.jsx";
import App from "./App.jsx";
import "./styles.css";
const standaloneDisplay = window.matchMedia("(display-mode: standalone)"),
  syncDisplayMode = () =>
    document.documentElement.classList.toggle(
      "installed-app",
      standaloneDisplay.matches || window.navigator.standalone === true,
    );
syncDisplayMode();
standaloneDisplay.addEventListener?.("change", syncDisplayMode);
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
