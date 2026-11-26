import { createEffect, onCleanup } from "solid-js";

// CloseWatcher is not in the TypeScript DOM types yet. It is undefined in
// browsers that do not support it (Safari and Firefox at the time of writing).
// https://html.spec.whatwg.org/multipage/interaction.html#the-closewatcher-interface
declare global {
  interface CloseWatcher extends EventTarget {
    requestClose(): void;
    close(): void;
    destroy(): void;
    oncancel: ((ev: Event) => void) | null;
    onclose: ((ev: Event) => void) | null;
  }

  var CloseWatcher: { prototype: CloseWatcher; new (options?: { signal?: AbortSignal }): CloseWatcher } | undefined;
}

// While active() is true, the Android back button calls onClose instead of
// going back in history. Does nothing in browsers without CloseWatcher.
export function createCloseWatcher(active: () => boolean, onClose: () => void) {
  createEffect(() => {
    const CloseWatcherClass = globalThis.CloseWatcher;
    if (!active() || !CloseWatcherClass) return;

    const watcher = new CloseWatcherClass();
    watcher.onclose = onClose;
    onCleanup(() => watcher.destroy());
  });
}
