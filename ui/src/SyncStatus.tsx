import { Component, createEffect, createSignal, Match, on, onCleanup, Show, Switch } from "solid-js";
import { formatDistance } from "date-fns";

import { useLists } from "./ListStore";
import { createSlowBoolSignal } from "./slow-bool-signal";

export const SyncStatus: Component = () => {
  const { getLastSyncTime, isSynchronizing, sync } = useLists();
  const slowIsSynchronizing = createSlowBoolSignal(isSynchronizing, 1000);
  const [now, setNow] = createSignal(new Date());
  const refreshNow = () => {
    setNow(new Date());
  };

  // refresh the "now" value every minute...
  const intervalId = setInterval(refreshNow, 60 * 1000);
  onCleanup(() => {
    clearInterval(intervalId);
  });

  // and when the "last sync time" changes
  createEffect(
    on(getLastSyncTime, () => {
      setNow(new Date());
    }),
  );

  return (
    <div class="flex flex-row flex-wrap justify-center gap-[0.1rem] text-[10pt]">
      <Switch>
        <Match when={slowIsSynchronizing()}>Synchronizing…</Match>
        <Match when={getLastSyncTime() !== undefined}>
          Last synchronized {formatDistance(getLastSyncTime()!, now(), { addSuffix: true })}.
        </Match>
      </Switch>
      <Show when={!slowIsSynchronizing()}>
        <button class="border-0 bg-transparent text-inherit underline cursor-pointer" onclick={sync}>
          Synchronize now
        </button>
      </Show>
    </div>
  );
};
