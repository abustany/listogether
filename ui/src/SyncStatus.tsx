import { Component, Match, Show, Switch } from "solid-js";
import { formatDistanceToNow } from "date-fns";

import { useLists } from "./ListStore";
import { createSlowBoolSignal } from "./slow-bool-signal";
import styles from "./SyncStatus.module.css";

export const SyncStatus: Component = () => {
  const { getLastSyncTime, isSynchronizing, sync } = useLists();
  const slowIsSynchronizing = createSlowBoolSignal(isSynchronizing, 1000);

  return (
    <div class={styles.SyncStatus}>
      <Switch>
        <Match when={slowIsSynchronizing()}>Synchronizing…</Match>
        <Match when={getLastSyncTime() !== undefined}>
          Last synchronized {formatDistanceToNow(getLastSyncTime()!, { addSuffix: true })}.
        </Match>
      </Switch>
      <Show when={!slowIsSynchronizing()}>
        <button onclick={sync}>Synchronize now</button>
      </Show>
    </div>
  );
};
