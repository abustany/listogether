import { Component, ParentComponent, createSignal } from "solid-js";
import { Router, Route, useBeforeLeave, useParams, RouteSectionProps } from "@solidjs/router";
import { Transition } from "solid-transition-group";

import { List } from "./List";
import { Lists } from "./Lists";
import { Import } from "./Import";
import { ListStoreProvider } from "./ListStore";
import { UpdateIndicator } from "./UpdateIndicator";

// We need an extra level of wrapping here to enable animations: the elements
// that gets replaced must have an absolute position (ie not be in the flow) to
// animate properly.
const RouteContainer: ParentComponent = (props) => {
  return (
    <div class="absolute left-0 top-0 w-screen h-screen p-[env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] transition-transform duration-[0.6s] flex justify-center">
      {props.children}
    </div>
  );
};

const forwardRouteTransitions = {
  enterClass: "route-enter-from",
  enterToClass: "route-enter-to",
  exitClass: "route-exit-from",
  exitToClass: "route-exit-to",
};

const reverseRouteTransitions = {
  enterClass: "route-exit-to",
  enterToClass: "route-enter-to",
  exitClass: "route-exit-from",
  exitToClass: "route-enter-from",
};

const Root: Component<RouteSectionProps<unknown>> = (props) => {
  const [transitions, setTransitions] = createSignal(forwardRouteTransitions);

  useBeforeLeave((ev) => {
    setTransitions(ev.to === "/" ? reverseRouteTransitions : forwardRouteTransitions);
  });
  return (
    <ListStoreProvider>
      <Transition name="route" {...transitions()}>
        {props.children}
      </Transition>
      <UpdateIndicator />
    </ListStoreProvider>
  );
};

const App: Component = () => {
  return (
    <div class="relative h-screen w-screen bg-[#ddd]">
      <Router root={Root}>
        <Route
          path="/import/:id"
          component={() => (
            <RouteContainer>
              <Import id={useParams<{ id: string }>().id} />
            </RouteContainer>
          )}
        />
        <Route
          path="/:id"
          component={() => (
            <RouteContainer>
              <List id={useParams<{ id: string }>().id} />
            </RouteContainer>
          )}
        />
        <Route
          path="/"
          component={() => (
            <RouteContainer>
              <Lists />
            </RouteContainer>
          )}
        />
      </Router>
    </div>
  );
};

export default App;
