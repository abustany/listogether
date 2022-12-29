/* @refresh reload */
import { render } from "solid-js/web";
import { Router } from "@solidjs/router";

import "./index.css";
import { ListStoreProvider } from "./ListStore";
import App from "./App";

if (!("serviceWorker" in navigator)) {
  throw new Error("service workers are not supported");
}

render(
  () => (
    <Router>
      <ListStoreProvider>
        <App />
      </ListStoreProvider>
    </Router>
  ),
  document.getElementById("app") as HTMLElement,
);
