import * as Sentry from "@sentry/browser";

export function captureException(e: unknown): void {
  if (import.meta.env.PROD) {
    Sentry.captureException(e);
  }
}
