/* @refresh reload */
import { render } from "solid-js/web";
import * as Sentry from "@sentry/browser";

import "./index.css";
import App from "./App";

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: "https://0604837b70f94e37b8f616bbc8121cbf@o71595.ingest.sentry.io/4504550606438400",
  });
}

if (!("serviceWorker" in navigator)) {
  console.error("service workers are not supported");
}

render(() => <App />, document.getElementById("app") as HTMLElement);
