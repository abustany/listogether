import { Component, ParentComponent, createSignal } from "solid-js";
import { Routes, Route, useBeforeLeave, useParams } from "@solidjs/router";
import { Transition } from "solid-transition-group";

import { List } from "./List";
import { Lists } from "./Lists";
import styles from "./App.module.css";
import { Import } from "./Import";

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

const App: Component = () => {
  const [transitions, setTransitions] = createSignal(forwardRouteTransitions);

  useBeforeLeave((ev) => {
    setTransitions(ev.to === "/" ? reverseRouteTransitions : forwardRouteTransitions);
  });

  return (
    <div class={styles.App}>
      <Transition name="route" {...transitions()}>
        <Routes>
          <Route
            path="/import/:id"
            component={() => (
              <RouteContainer>
                <Import id={useParams().id} />
              </RouteContainer>
            )}
          />
          <Route
            path="/:id"
            component={() => (
              <RouteContainer>
                <List id={useParams().id} />
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
        </Routes>
      </Transition>
    </div>
  );
};

export default App;
