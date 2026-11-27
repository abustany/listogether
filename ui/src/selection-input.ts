import { createEffect, onMount } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";

import { Section } from "./list-schema";
import { ListSelection, Row, sameRow } from "./ListSelection";
import { createCloseWatcher } from "./close-watcher";

// Rows have data-section and data-item attributes; the placeholders have none.
function rowFromElement(el: Element | null): Row | undefined {
  const rowEl = el?.closest<HTMLElement>("[data-section]");
  if (!rowEl) return undefined;

  const s = Number(rowEl.dataset.section);
  if (rowEl.dataset.item === undefined) return { kind: "title", s };
  return { kind: "item", s, i: Number(rowEl.dataset.item) };
}

function rowAtPoint(x: number, y: number): Row | undefined {
  return rowFromElement(document.elementFromPoint(x, y));
}

// Not from an item text or a section title input, where a long press selects
// text. The section menu button covers most of the padding of a title row, so
// a long press on it starts the mode too.
function isLongPressTarget(el: Element): boolean {
  const rowEl = el.closest("[data-section]");
  if (!rowEl) return false;
  if (rowEl.matches("li")) return el.closest("[contenteditable]") === null;
  return el === rowEl || el.closest("button") !== null;
}

const LongPressMs = 450;
const LongPressMoveTolerancePx = 10;

function createLongPress(
  container: () => HTMLElement,
  handlers: { onPress: (row: Row) => void; onDrag: (from: Row, to: Row) => void },
) {
  let press: { row: Row; last: Row; x: number; y: number; timer: number; fired: boolean } | null = null;

  const cancel = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };

  const fire = () => {
    if (!press || press.fired) return;

    clearTimeout(press.timer);
    press.fired = true;
    handlers.onPress(press.row);
  };

  onMount(() => {
    const el = container();

    makeEventListener(
      el,
      "touchstart",
      (ev) => {
        cancel();
        if (ev.touches.length !== 1) return;

        const target = ev.target as Element;
        const row = rowFromElement(target);
        if (!row || !isLongPressTarget(target)) return;

        const { clientX: x, clientY: y } = ev.touches[0];
        press = { row, last: row, x, y, timer: window.setTimeout(fire, LongPressMs), fired: false };
      },
      { passive: true },
    );

    // Not passive, so that it can block scrolling during a drag.
    makeEventListener(
      el,
      "touchmove",
      (ev) => {
        if (!press) return;

        const touch = ev.touches[0];
        if (!press.fired) {
          if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > LongPressMoveTolerancePx) cancel();
          return;
        }

        ev.preventDefault();

        const row = rowAtPoint(touch.clientX, touch.clientY);
        if (!row || sameRow(row, press.last)) return;

        handlers.onDrag(press.last, row);
        press.last = row;
      },
      { passive: false },
    );

    makeEventListener(
      el,
      "touchend",
      (ev) => {
        // The click that follows a long press must not toggle the item, nor
        // its checkbox.
        if (press?.fired && ev.cancelable) ev.preventDefault();
        cancel();
      },
      { passive: false },
    );

    makeEventListener(el, "touchcancel", cancel);

    makeEventListener(el, "contextmenu", (ev) => {
      if (!isLongPressTarget(ev.target as Element)) return;

      // A long press opens the context menu on Android. It may come before the
      // timer.
      ev.preventDefault();
      fire();
    });
  });
}

// Deleting is left to the caller, which owns the editor.
export function createSelectionInput(options: {
  sections: Section[];
  selection: ListSelection;
  onDelete: (focusPrevious: boolean) => void;
  scrollToRow: (row: Row) => void;
}) {
  const { sections, selection } = options;

  let container!: HTMLElement;

  // The type of the last pointer used. After a delete, the caret goes to the
  // element before the deleted ones, except after a tap: the keyboard would
  // open on mobile.
  let lastPointerType = "mouse";
  makeEventListener(
    document,
    "pointerdown",
    (ev) => {
      lastPointerType = ev.pointerType;
    },
    { capture: true },
  );

  // Set after a drag or a Shift+click that started the mode, so that the click
  // that ends it does not toggle a row.
  let suppressNextClick = false;

  createCloseWatcher(selection.active, selection.stop);

  // Nothing can be edited in the mode. Blurring also closes the keyboard on
  // mobile.
  createEffect(() => {
    if (!selection.active()) return;

    (document.activeElement as HTMLElement | null)?.blur();
    getSelection()?.removeAllRanges();
  });

  makeEventListener(document, "keydown", (ev) => {
    // The key press that starts the mode is handled by startFromKeyboard,
    // which prevents its default action.
    if (!selection.active() || ev.defaultPrevented) return;

    switch (ev.key) {
      case "Escape":
        ev.preventDefault();
        selection.stop();
        return;
      case "Backspace":
      case "Delete":
        ev.preventDefault();
        options.onDelete(true);
        return;
      case "ArrowUp":
      case "ArrowDown": {
        if (!ev.shiftKey) return;

        ev.preventDefault();
        const added = selection.extend(ev.key === "ArrowDown" ? 1 : -1);
        if (added) options.scrollToRow(added);
        return;
      }
    }

    // Space must still activate the banner buttons.
    const isCharacter = ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey;
    if (isCharacter && !(ev.target instanceof HTMLButtonElement)) ev.preventDefault();
  });

  createLongPress(() => container, {
    onPress: (row) => {
      if (selection.active()) selection.press(row);
      else selection.start(row);
    },
    onDrag: selection.dragTo,
  });

  let drag: { start: Row; last: Row; moved: boolean } | null = null;

  const endDrag = () => {
    if (drag?.moved) suppressNextClick = true;
    drag = null;
  };
  makeEventListener(window, "pointerup", endDrag);
  makeEventListener(window, "pointercancel", endDrag);

  return {
    ref: (el: HTMLElement) => {
      container = el;
    },

    lastPointerWasTouch: () => lastPointerType === "touch",

    startFromKeyboard(s: number, i: number, dir: 1 | -1, ev: KeyboardEvent) {
      if (i === sections[s].items.length - 1) {
        const above = selection.itemAbovePlaceholder(s);
        if (!above) return;

        ev.preventDefault();
        selection.start(above);
        return;
      }

      ev.preventDefault();
      selection.start({ kind: "item", s, i });
      selection.extend(dir);
    },

    onPointerDown(ev: PointerEvent) {
      suppressNextClick = false;
      drag = null;

      if (ev.pointerType !== "mouse" || ev.button !== 0 || ev.shiftKey) return;

      const row = rowFromElement(ev.target as Element);
      if (!row || (!selection.active() && row.kind !== "item")) return;

      drag = { start: row, last: row, moved: false };
    },

    onPointerMove(ev: PointerEvent) {
      if (!drag || ev.pointerType !== "mouse" || (ev.buttons & 1) === 0) return;

      const row = rowAtPoint(ev.clientX, ev.clientY);
      if (!row || sameRow(row, drag.last)) return;

      if (!drag.moved) {
        drag.moved = true;
        if (!selection.active() && drag.start.kind === "item") selection.start(drag.start);
      }

      // Fill the range from the last row, in case the pointer moved over
      // several rows between two events.
      selection.dragTo(drag.last, row);
      drag.last = row;
      getSelection()?.removeAllRanges();
    },

    onMouseDown(ev: MouseEvent) {
      if (selection.active()) {
        // No caret and no text selection in the mode.
        ev.preventDefault();
        return;
      }

      if (!ev.shiftKey || ev.button !== 0) return;

      const focused = rowFromElement(document.activeElement);
      const clicked = rowFromElement(ev.target as Element);
      if (focused?.kind !== "item" || clicked?.kind !== "item" || sameRow(focused, clicked)) return;

      ev.preventDefault();
      selection.start(focused);
      selection.shiftClick(clicked);
      suppressNextClick = true;
    },

    onClick(ev: MouseEvent) {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }

      if (!selection.active()) return;

      const row = rowFromElement(ev.target as Element);
      if (!row) return;

      if (ev.shiftKey && row.kind === "item") selection.shiftClick(row);
      else selection.toggle(row);
    },

    onFocusIn(ev: FocusEvent) {
      // Fallback in case an input or an item gets the focus in the mode anyway.
      const target = ev.target;
      if (selection.active() && target instanceof HTMLElement && target.matches("input, [contenteditable]")) {
        target.blur();
      }
    },
  };
}
