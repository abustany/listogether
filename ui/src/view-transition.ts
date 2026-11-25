import { createEffect, on } from "solid-js";
import { useIsRouting } from "@solidjs/router";

// Route changes are animated with the View Transitions API. The animations
// themselves are in index.css, and depend on the data-nav attribute set on the
// root element.
//
// The browser takes a snapshot of the old page before the update callback runs,
// so the router must not update the DOM before that. In-app navigations are held
// back from a useBeforeLeave handler (see App.tsx), and history navigations
// (back/forward) by interceptHistoryNavigations below.

type NavDirection = "forward" | "back";

// If the router does not report the end of a navigation (for example, because
// the target is the current page), stop waiting after this delay.
const RoutingTimeoutMs = 500;

let activeTransition: ViewTransition | undefined;
let routingWaiters: (() => void)[] = [];

// Must be called once, from a component inside the router.
export function trackRouting() {
  const isRouting = useIsRouting();
  createEffect(
    on(isRouting, (routing) => {
      if (routing) return;
      const waiters = routingWaiters;
      routingWaiters = [];
      waiters.forEach((resolve) => resolve());
    }),
  );
}

function routingDone(): Promise<void> {
  return new Promise((resolve) => {
    routingWaiters.push(resolve);
    setTimeout(resolve, RoutingTimeoutMs);
  });
}

export function canStartRouteTransition(): boolean {
  return typeof document.startViewTransition === "function" && activeTransition === undefined;
}

// Going to the lists page is "back", everything else is "forward".
export function directionTo(to: string): NavDirection {
  return new URL(to, window.location.href).pathname === "/" ? "back" : "forward";
}

// Starts a view transition. navigate must start the navigation; the transition
// waits for the router to render the new page.
export function startRouteTransition(direction: NavDirection, navigate: () => void) {
  const root = document.documentElement;
  root.dataset.nav = direction;

  const transition = document.startViewTransition(() => {
    navigate();
    return routingDone();
  });
  activeTransition = transition;

  // ready rejects when the transition is skipped (for example, when the page is
  // hidden). The navigation happens anyway.
  transition.ready.catch(() => {});
  const cleanup = () => {
    activeTransition = undefined;
    delete root.dataset.nav;
  };
  transition.finished.then(cleanup, cleanup);
}

// Animates back/forward navigations, unless the browser already animated them
// itself (for example, the iOS swipe back gesture).
//
// The router updates the DOM in its own popstate listener. This listener runs
// first (capture phase), stops the event, and dispatches it again from the
// view transition callback, once the old page snapshot is taken. The router
// reads the new URL and history state from the browser, so the replayed event
// works like the original one.
export function interceptHistoryNavigations() {
  let replaying = false;

  window.addEventListener(
    "popstate",
    (ev) => {
      // hasUAVisualTransition is undefined in browsers that do not support it.
      // Then we cannot know if the browser animated the navigation, so do not
      // animate.
      if (replaying || ev.hasUAVisualTransition !== false || !canStartRouteTransition()) return;

      ev.stopImmediatePropagation();
      startRouteTransition(directionTo(window.location.href), () => {
        replaying = true;
        try {
          window.dispatchEvent(new PopStateEvent("popstate", { state: ev.state }));
        } finally {
          replaying = false;
        }
      });
    },
    { capture: true },
  );
}
