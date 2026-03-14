import { createUniqueId, ParentComponent } from "solid-js";
import { Portal } from "solid-js/web";

import { X } from "./icons/X";

export const Modal: ParentComponent<{
  title: string;
  onClose: () => void;
}> = (props) => {
  const titleId = createUniqueId();
  return (
    <Portal mount={document.getElementById("portal")!}>
      <div class="fixed top-0 left-0 w-screen h-screen bg-[#333] opacity-70" />
      <div class="fixed top-0 left-0 w-screen h-screen backdrop-blur-[2px]" />
      <div
        class="fixed top-0 left-0 w-screen h-screen flex flex-col justify-center items-center"
        onclick={props.onClose}
        role="dialog"
        aria-labelledby={titleId}
      >
        <div
          class="relative flex-none bg-white max-w-[500px] rounded-[10px] p-4 m-4 flex flex-col"
          onclick={(ev) => {
            ev.stopPropagation();
          }}
        >
          <header class="flex-none mb-2 text-[1.3rem] font-bold" id={titleId}>
            {props.title}
          </header>
          <button
            onclick={props.onClose}
            class="absolute top-2.5 right-2.5 text-inherit border-0 bg-transparent cursor-pointer"
            title="Close"
          >
            <X />
          </button>
          <div class="flex-1 flex flex-col gap-2 items-start">{props.children}</div>
        </div>
      </div>
    </Portal>
  );
};
