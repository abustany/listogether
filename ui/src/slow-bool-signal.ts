import { Accessor, createEffect, createSignal, on, onCleanup } from "solid-js";

/**
 * Transforms signal so that when it becomes true, it stays true for at least
 * timeout milliseconds.
 *
 * This is useful to avoid UI elements appearing and then disappearing again
 * too quickly.
 */
export function createSlowBoolSignal(signal: Accessor<boolean>, timeout: number): Accessor<boolean> {
  const [getVal, setVal] = createSignal(false);
  let lastTrueTime: number;
  let timeoutId: number;

  const clearSetValTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };

  createEffect(
    on(
      signal,
      (v) => {
        if (v) {
          // rising edge
          lastTrueTime = Date.now();
          clearSetValTimeout();
          setVal(v);
        } else {
          // falling edge
          const elapsed = Date.now() - lastTrueTime;

          if (elapsed > 1000) {
            setVal(v);
          } else {
            clearSetValTimeout();
            timeoutId = setTimeout(() => {
              setVal(v);
            }, timeout);
          }
        }
      },
      { defer: true },
    ),
  );

  onCleanup(clearSetValTimeout);

  return getVal;
}
