import { Component, createUniqueId, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

import { cn } from "./cn";
import { MoreVertical } from "./icons/MoreVertical";

const menuItem = "border-0 rounded bg-transparent text-left text-inherit px-3 py-1.5 cursor-pointer hover:bg-[#eee]";

// The button goes in the section title row, which must be `relative`.
export const SectionMenu: Component<{
  invisible: boolean;
  onSelect: () => void;
  onSort: () => void;
  onDelete: () => void;
}> = (props) => {
  const id = createUniqueId();
  let button!: HTMLButtonElement;
  let menu!: HTMLDivElement;

  // The menu is in the top layer, so it does not move with the list: follow
  // the button.
  const place = () => {
    const rect = button.getBoundingClientRect();
    const below = rect.bottom < window.innerHeight / 2;
    menu.style.left = `${rect.left}px`;
    menu.style.top = below ? `${rect.bottom + 4}px` : "auto";
    menu.style.bottom = below ? "auto" : `${window.innerHeight - rect.top + 4}px`;
  };

  const followButton = (on: boolean) => {
    const method = on ? "addEventListener" : "removeEventListener";
    window[method]("scroll", place, { capture: true, passive: true });
    window[method]("resize", place);
  };
  onCleanup(() => followButton(false));

  const run = (action: () => void) => () => {
    menu.hidePopover();
    action();
  };

  return (
    <>
      <button
        ref={(el) => {
          button = el;
        }}
        type="button"
        class={cn(
          "absolute left-1 top-1/2 -translate-y-1/2 flex p-0.5 border-0 rounded bg-transparent text-[#999] cursor-pointer hover:text-inherit hover:bg-[#eee]",
          props.invisible && "invisible",
        )}
        aria-label="Section menu"
        aria-haspopup="menu"
        popovertarget={id}
      >
        <MoreVertical size="1.25rem" />
      </button>
      {/* Not inside the title row, so that the selection input handlers do not
          see clicks in the menu as clicks on the row. */}
      <Portal mount={document.getElementById("portal")!}>
        <div
          ref={(el) => {
            menu = el;
            el.addEventListener("beforetoggle", (ev) => {
              const open = ev.newState === "open";
              if (open) place();
              followButton(open);
            });
          }}
          id={id}
          popover="auto"
          role="menu"
          aria-label="Section"
          class="fixed inset-auto m-0 p-1 border border-[#ccc] rounded-lg bg-white shadow-lg flex-col open:flex"
        >
          <button type="button" role="menuitem" class={menuItem} onClick={run(props.onSelect)}>
            Select
          </button>
          <button type="button" role="menuitem" class={menuItem} onClick={run(props.onSort)}>
            Sort by name
          </button>
          <button type="button" role="menuitem" class={menuItem} onClick={run(props.onDelete)}>
            Delete
          </button>
        </div>
      </Portal>
    </>
  );
};
