import { Component, ParentComponent, createSignal } from "solid-js";
import { Router, Route, useBeforeLeave, useParams, RouteSectionProps } from "@solidjs/router";
import { Transition } from "solid-transition-group";

import { List } from "./List";
import { Lists } from "./Lists";
import styles from "./App.module.css";
import { Import } from "./Import";
import { ListStoreProvider } from "./ListStore";
import { UpdateIndicator } from "./UpdateIndicator";

// We need an extra level of wrapping here to enable animations: the elements
// that gets replaced must have an absolute position (ie not be in the flow) to
// animate properly.
const RouteContainer: ParentComponent = (props) => {
  return <div class={styles.RouteContainer}>{props.children}</div>;
};

const forwardRouteTransitions = {
  enterClass: styles.RouteEnterFrom,
  enterToClass: styles.RouteEnterTo,
  exitClass: styles.RouteExitFrom,
  exitToClass: styles.RouteExitTo,
};

const reverseRouteTransitions = {
  enterClass: styles.RouteExitTo,
  enterToClass: styles.RouteEnterTo,
  exitClass: styles.RouteExitFrom,
  exitToClass: styles.RouteEnterFrom,
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
    <div class={styles.App}>
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
