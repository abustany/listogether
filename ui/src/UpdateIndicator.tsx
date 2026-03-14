import { Component, createSignal, Show } from "solid-js";
import { useRegisterSW } from "virtual:pwa-register/solid";
import { cn } from "./cn";

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
  };

  const onDismiss = () => {
    setNeedRefresh(false);
  };

  return (
    <Show when={needRefresh()}>
      <div
        class={cn(
          "fixed right-5 bottom-5 bg-[#dc4945] p-5 rounded-[5px] flex flex-col gap-4 transition-transform duration-500 ease-[cubic-bezier(0.19,1,0.22,1)]",
          entering() ? "translate-y-[8em]" : "translate-y-0",
        )}
      >
        An update is available 🎉
        <div class="flex justify-center gap-4">
          <button onclick={onUpdate}>Reload to update</button>
          <button onclick={onDismiss}>Dismiss</button>
        </div>
      </div>
    </Show>
  );
};
