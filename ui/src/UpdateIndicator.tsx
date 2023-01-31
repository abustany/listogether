import { Component, createSignal, Show } from "solid-js";
import { useRegisterSW } from "virtual:pwa-register/solid";

import styles from "./UpdateIndicator.module.css";

export const UpdateIndicator: Component = () => {
  const [entering, setEntering] = createSignal(true);
  setTimeout(() => {
    setEntering(false);
  }, 0);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("SW registration error", error);
    },
  });

  const onUpdate = () => {
    updateServiceWorker(true); // param is actually ignored now

    // hack: leave a bit of time for the new service worker to activate (just
    // waiting on the Promise above is not enough.)
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const onDismiss = () => {
    setNeedRefresh(false);
  };

  return (
    <Show when={needRefresh()}>
      <div classList={{ [styles.UpdateIndicator]: true, [styles.Entering]: entering() }}>
        An update is available 🎉
        <div class={styles.Buttons}>
          <button onclick={onUpdate}>Reload to update</button>
          <button onclick={onDismiss}>Dismiss</button>
        </div>
      </div>
    </Show>
  );
};
