import { Component } from "solid-js";
import { Router, Route, useBeforeLeave, useParams, RouteSectionProps } from "@solidjs/router";

import { List } from "./List";
import { Lists } from "./Lists";
import { Import } from "./Import";
import { ListStoreProvider } from "./ListStore";
import { UpdateIndicator } from "./UpdateIndicator";
import { canStartRouteTransition, startRouteTransition, trackRouting } from "./view-transition";

const Root: Component<RouteSectionProps<unknown>> = (props) => {
  trackRouting();

  useBeforeLeave((ev) => {
    // History navigations (back/forward) have a number as target. They are
    // handled by interceptHistoryNavigations.
    if (typeof ev.to !== "string" || !canStartRouteTransition()) return;

    ev.preventDefault();
    startRouteTransition(ev.from.pathname, ev.to, () => ev.retry(true));
  });

  return (
    <ListStoreProvider>
      {props.children}
      <UpdateIndicator />
    </ListStoreProvider>
  );
};

const App: Component = () => {
  return (
    <div class="h-screen w-screen bg-[#ddd] p-[env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] flex justify-center">
      <Router root={Root}>
        <Route path="/import/:id" component={() => <Import id={useParams<{ id: string }>().id} />} />
        <Route path="/:id" component={() => <List id={useParams<{ id: string }>().id} />} />
        <Route path="/" component={() => <Lists />} />
      </Router>
    </div>
  );
};

export default App;
