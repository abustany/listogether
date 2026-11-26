// CloseWatcher is not in the TypeScript DOM types yet. It is undefined in
// browsers that do not support it (Safari and Firefox at the time of writing).
// https://html.spec.whatwg.org/multipage/interaction.html#the-closewatcher-interface

interface CloseWatcher extends EventTarget {
  requestClose(): void;
  close(): void;
  destroy(): void;
  oncancel: ((ev: Event) => void) | null;
  onclose: ((ev: Event) => void) | null;
}

declare var CloseWatcher:
  | { prototype: CloseWatcher; new (options?: { signal?: AbortSignal }): CloseWatcher }
  | undefined;
