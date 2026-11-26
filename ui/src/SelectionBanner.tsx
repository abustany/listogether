import { Component } from "solid-js";

const bannerButton =
  "border-0 rounded-full px-3 py-1 bg-white/15 text-inherit cursor-pointer hover:bg-white/25 disabled:opacity-40 disabled:cursor-default disabled:hover:bg-white/15";

export const SelectionBanner: Component<{
  summary: string;
  checkAction: "check" | "uncheck" | null;
  canDelete: boolean;
  onToggleChecked: () => void;
  onDelete: () => void;
  onDone: () => void;
}> = (props) => {
  return (
    <div
      role="toolbar"
      aria-label="Selection"
      class="fixed z-10 left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+1rem)] max-w-[calc(100vw-2rem)] px-4 py-2 rounded-3xl bg-[#333] text-white shadow-lg flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
    >
      <span class="whitespace-nowrap" aria-live="polite">
        {props.summary}
      </span>
      <div class="flex gap-2">
        <button
          type="button"
          class={bannerButton}
          disabled={props.checkAction === null}
          onClick={props.onToggleChecked}
        >
          {props.checkAction === "uncheck" ? "Uncheck" : "Check"}
        </button>
        <button type="button" class={bannerButton} disabled={!props.canDelete} onClick={props.onDelete}>
          Delete
        </button>
        <button type="button" class={bannerButton} onClick={props.onDone}>
          Done
        </button>
      </div>
    </div>
  );
};
