import { batch, Component, For, onCleanup, onMount, Match, Show, Switch } from "solid-js";
import { A } from "@solidjs/router";
import { makeEventListener } from "@solid-primitives/event-listener";

import { useLists } from "./ListStore";
import { ArrowLeft } from "./icons/ArrowLeft";
import { List as ListSchema, Section } from "./list-schema";
import { createListEditor } from "./ListEditor";
import { cn } from "./cn";
import { createListSelection, Row, rowKey, sameRow, selectableRows } from "./ListSelection";
import { SelectionBanner } from "./SelectionBanner";
import { useBackToLists } from "./back-to-lists";

// Computes a string "address" for a given input element. This is used to
// address the HTML input elements in a map.
//
// The syntax of an input ref path is SECTION_IDX for sections, or
// SECTION_IDX.ITEM_IDX for items. All indexes are 0-based. As a special case,
// the empty input ref path represents the note title field.
function inputRefPath(sectionIdx?: number, itemIdx?: number): string {
  if (sectionIdx === undefined) return "";
  return `${sectionIdx}${itemIdx === undefined ? "" : `.${itemIdx}`}`;
}

function previousInputRefPath(
  sections: Section[],
  sectionIdx: number | undefined,
  itemIdx: number | undefined,
): string | undefined {
  if (sectionIdx === undefined) return undefined; // no going up from the title

  const section = sections[sectionIdx];
  if (!section) return undefined;

  if (itemIdx === undefined && sectionIdx === 0) {
    // up to title
    return inputRefPath();
  }

  if (itemIdx === undefined) {
    // from section header to last item of previous section
    const previousSection = sections[sectionIdx - 1];
    const lastItemIdx = previousSection ? previousSection.items.length - 1 : undefined;
    return inputRefPath(sectionIdx - 1, lastItemIdx);
  }

  if (itemIdx === 0) {
    // up to section header
    return inputRefPath(sectionIdx);
  }

  // up one item
  return inputRefPath(sectionIdx, itemIdx - 1);
}

function nextInputRefPath(
  sections: Section[],
  sectionIdx: number | undefined,
  itemIdx: number | undefined,
): string | undefined {
  if (sectionIdx === undefined) {
    // down from title
    return sections.length > 0 ? inputRefPath(0) : undefined;
  }

  const section = sections[sectionIdx];
  if (!section) return undefined;

  const nextItemIdx = itemIdx === undefined ? 0 : 1 + itemIdx;

  if (section.items[nextItemIdx]) return inputRefPath(sectionIdx, nextItemIdx);
  if (sectionIdx < sections.length - 1) return inputRefPath(1 + sectionIdx);
  return undefined; // nothing after last item of last section
}

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
// text.
function isLongPressTarget(el: Element): boolean {
  const rowEl = el.closest("[data-section]");
  if (!rowEl) return false;
  if (rowEl.matches("li")) return el.closest("[contenteditable]") === null;
  return el === rowEl;
}

const LongPressMs = 450;
const LongPressMoveTolerancePx = 10;

const selectedRow = "bg-[#b3d7ff]";

function moveCaretToEnd(el: HTMLElement) {
  if (el instanceof HTMLInputElement) {
    el.setSelectionRange(el.value.length, el.value.length);
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);

  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

const transparentInput = "m-0 text-[inherit] border-0 outline-0 bg-inherit";

const ListLoaded: Component<{ list: ListSchema }> = (props) => {
  const { updateList } = useLists();
  const backToLists = useBackToLists();

  let nameInputRef: HTMLInputElement;

  const {
    sections,
    changes,
    clearChanges,

    renameList,
    appendSection,
    renameSection,
    deleteSection,
    appendItem,
    renameItem,
    deleteItem,
    toggleItem,
  } = createListEditor(props.list);

  // Maps inputRefPath of each element to the element
  const inputRefs = new Map<string, HTMLElement>();
  const setInputRef = (el: HTMLElement, sectionIdx?: number, itemIdx?: number) => {
    inputRefs.set(inputRefPath(sectionIdx, itemIdx), el);
  };

  const save = async () => {
    if (!props.list) return;

    if (props.list.name !== nameInputRef.value) {
      renameList(nameInputRef.value);
    }

    await updateList(props.list.id, changes);
  };

  makeEventListener(window, "blur", async () => {
    await save();
    clearChanges();
  });
  onCleanup(save);

  // Moves the focus to the element at inputRefPath once it has been rendered,
  // keeping the caret at the same offset as in source.
  function restoreCaretPositionAtNextTick(source: HTMLElement, inputRefPath: string) {
    // Text inputs have their own selection, which is not reflected in the
    // document selection.
    const selectionEnd =
      source instanceof HTMLInputElement ? (source.selectionEnd ?? 0) : (getSelection()?.getRangeAt(0).endOffset ?? 0);

    const afterTick = () => {
      const el = inputRefs.get(inputRefPath);
      if (!el) return;

      el.focus();

      if (el instanceof HTMLInputElement) {
        el.setSelectionRange(selectionEnd, selectionEnd);
        return;
      }

      const newSelectionRange = getSelection()?.getRangeAt(0);
      newSelectionRange?.setStart(newSelectionRange.endContainer, selectionEnd);
      newSelectionRange?.setEnd(newSelectionRange.endContainer, selectionEnd);
    };

    setTimeout(afterTick, 0);
  }

  // Adds a section just before the "new section" placeholder.
  const addSection = (placeholder: HTMLElement, name: string) => {
    // The new section is rendered at the index of the placeholder, which moves
    // down by one. Its ref callback does not run again, so update its path by
    // hand before the new section registers its own ref.
    inputRefs.set(inputRefPath(sections.length), placeholder);
    appendSection(name);
  };

  const onSectionNameChanged = (idx: number, ev: Event) => {
    const input = ev.target as HTMLInputElement;
    const name = input.value ?? "";

    if (idx === sections.length - 1) {
      restoreCaretPositionAtNextTick(input, inputRefPath(idx));
      input.value = ""; // reset the value since a new section will be appended
      addSection(input, name);
    } else {
      renameSection(idx, name);
    }
  };

  const remapInputRefs = (newPath: (s: number, i?: number) => string | undefined) => {
    const entries = [...inputRefs.entries()];
    inputRefs.clear();

    for (const [path, el] of entries) {
      // The empty path is the list name, which never moves.
      if (path === "") {
        inputRefs.set(path, el);
        continue;
      }

      const [s, i] = path.split(".").map(Number);
      const p = newPath(s, i);
      if (p !== undefined) inputRefs.set(p, el);
    }
  };

  // Deleting a title deletes its whole section. Returns the path of the element
  // before the first deleted one, where the caret goes after a delete. That
  // element is never deleted, so its path does not change.
  const deleteRows = (isDeleted: (row: Row) => boolean): string | undefined => {
    const first = selectableRows(sections).find(isDeleted);
    if (!first) return undefined;

    const focusPath = previousInputRefPath(sections, first.s, first.kind === "item" ? first.i : undefined);
    const isSectionDeleted = (s: number) => isDeleted({ kind: "title", s });
    const isItemDeleted = (s: number, i: number) => isDeleted({ kind: "item", s, i });

    batch(() => {
      // Delete from the end, so that the indexes of the rows that are still to
      // delete do not change. The last section is the "New section…"
      // placeholder, and the last item of a section is its "new item"
      // placeholder.
      for (let s = sections.length - 2; s >= 0; s--) {
        if (isSectionDeleted(s)) {
          deleteSection(s);
          continue;
        }

        for (let i = sections[s].items.length - 2; i >= 0; i--) {
          if (isItemDeleted(s, i)) deleteItem(s, i);
        }
      }
    });

    remapInputRefs((s, i) => {
      if (isSectionDeleted(s)) return undefined;
      let newS = s;
      for (let t = 0; t < s; t++) if (isSectionDeleted(t)) newS--;
      if (i === undefined) return inputRefPath(newS);

      if (isItemDeleted(s, i)) return undefined;
      let newI = i;
      for (let j = 0; j < i; j++) if (isItemDeleted(s, j)) newI--;
      return inputRefPath(newS, newI);
    });

    return focusPath;
  };

  const insertItem = (sectionIdx: number, itemIdx: number, text: string) => {
    // Move the refs of the following items *before* calling appendItem, so
    // that the ref of the new item does not override an existing value.
    remapInputRefs((s, i) => inputRefPath(s, s === sectionIdx && i !== undefined && i >= itemIdx ? i + 1 : i));

    appendItem(sectionIdx, itemIdx, text);
  };

  const onItemTextChanged = (sectionIdx: number, itemIdx: number, ev: Event) => {
    const target = ev.target as HTMLElement;
    const text = target.textContent ?? "";

    if (itemIdx === sections[sectionIdx].items.length - 1) {
      restoreCaretPositionAtNextTick(target, inputRefPath(sectionIdx, itemIdx));
      insertItem(sectionIdx, itemIdx, text);

      // Reset the text of the placeholder
      target.textContent = "";
    } else {
      renameItem(sectionIdx, itemIdx, text);
    }
  };

  const onItemValueChanged = (sectionIdx: number, itemIdx: number, ev: Event) => {
    const checked = (ev.target as HTMLInputElement).checked;
    toggleItem(sectionIdx, itemIdx, checked);
  };

  const onItemKeyDown = (sectionIdx: number | undefined, itemIdx: number | undefined, ev: KeyboardEvent) => {
    if (ev.shiftKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
      if (sectionIdx === undefined || itemIdx === undefined) return;

      startSelectionFromKeyboard(sectionIdx, itemIdx, ev.key === "ArrowDown" ? 1 : -1, ev);
      return;
    }

    let path: string | undefined;
    let caretAtEnd = false;

    switch (ev.key) {
      case "ArrowUp":
        path = previousInputRefPath(sections, sectionIdx, itemIdx);
        break;
      case "ArrowDown":
        path = nextInputRefPath(sections, sectionIdx, itemIdx);
        break;
      case "Backspace":
        // The keydown even dispatches before the input event, which means this
        // doesn't match the backspace that makes an item become empty, it only
        // matches a backspace on an already empty item. This is actually what
        // we want.

        if (sectionIdx === undefined) return;

        if (itemIdx === undefined && sections[sectionIdx].items.length === 1 && sections[sectionIdx].name === "") {
          path = deleteRows((row) => row.s === sectionIdx);
          caretAtEnd = true;
        }

        // We filter out backspace event on the last item of a section, which
        // is always the "New item" placeholder.
        if (
          itemIdx !== undefined &&
          itemIdx !== sections[sectionIdx].items.length - 1 &&
          sections[sectionIdx].items[itemIdx].text === ""
        ) {
          path = deleteRows((row) => row.kind === "item" && row.s === sectionIdx && row.i === itemIdx);
          caretAtEnd = true;
        }
        break;
      case "Enter":
        if (sectionIdx === undefined) {
          // From the list name, move to the first section name
          path = inputRefPath(0);
          break;
        }

        if (itemIdx === undefined && sectionIdx === sections.length - 1) {
          // From the "new section" placeholder, add an unnamed section and
          // move to its new item placeholder
          addSection(ev.target as HTMLElement, "");
          path = inputRefPath(sectionIdx, 0);
          break;
        }

        const targetSectionIdx = sectionIdx;
        const targetItemIdx = itemIdx !== undefined ? 1 + itemIdx : 0;

        let itemText: string | undefined;

        if (sectionIdx !== undefined && itemIdx !== undefined) {
          const splitIdx = getSelection()?.getRangeAt(0).endOffset;
          itemText = sections[sectionIdx].items[itemIdx]?.text.slice(splitIdx);
        }

        insertItem(targetSectionIdx, targetItemIdx, itemText ?? "");
        path = inputRefPath(targetSectionIdx, targetItemIdx);

        if (itemText) {
          // If we split an item in two, update the sections and the DOM
          const previousText = sections[sectionIdx!].items[itemIdx!].text;
          const truncatedText = previousText.slice(0, previousText.length - itemText.length);
          renameItem(sectionIdx!, itemIdx!, truncatedText);

          const el = inputRefs.get(inputRefPath(sectionIdx, itemIdx));
          if (el) el.textContent = truncatedText;
        }

        break;
      default:
        return;
    }

    if (path === undefined) return;

    ev.preventDefault();

    const el = inputRefs.get(path);
    if (!el) return;

    el.focus();
    if (caretAtEnd) moveCaretToEnd(el);
  };

  const selection = createListSelection(sections);

  let containerRef: HTMLDivElement;

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

  // On Android, the back button exits the mode instead of leaving the list.
  let closeWatcher: CloseWatcher | null = null;

  const exitSelection = () => {
    closeWatcher?.destroy();
    closeWatcher = null;
    selection.stop();
  };
  onCleanup(exitSelection);

  const enterSelection = (from: Row) => {
    // Blurring also closes the keyboard on mobile.
    (document.activeElement as HTMLElement | null)?.blur();
    getSelection()?.removeAllRanges();

    selection.start(from);

    const CloseWatcherClass = globalThis.CloseWatcher;
    if (CloseWatcherClass && !closeWatcher) {
      closeWatcher = new CloseWatcherClass();
      closeWatcher.onclose = () => {
        closeWatcher = null;
        exitSelection();
      };
    }
  };

  const startSelectionFromKeyboard = (s: number, i: number, dir: 1 | -1, ev: KeyboardEvent) => {
    if (i === sections[s].items.length - 1) {
      const above = selection.itemAbovePlaceholder(s);
      if (!above) return;

      ev.preventDefault();
      enterSelection(above);
      return;
    }

    ev.preventDefault();
    enterSelection({ kind: "item", s, i });
    selection.extend(dir);
  };

  const toggleSelectedChecked = () => {
    const checked = selection.checkAction() === "check";

    for (const { s, i } of selection.selectedItems()) {
      if (sections[s].items[i].checked !== checked) toggleItem(s, i, checked);
    }
  };

  const deleteSelection = (focusPrevious: boolean) => {
    if (selection.isEmpty()) return;

    const path = deleteRows(selection.isSelected);
    exitSelection();

    const el = focusPrevious && path !== undefined ? inputRefs.get(path) : undefined;
    if (!el) return;

    el.focus();
    moveCaretToEnd(el);
  };

  makeEventListener(document, "keydown", (ev) => {
    // The key press that starts the mode is handled by onItemKeyDown, which
    // prevents its default action.
    if (!selection.active() || ev.defaultPrevented) return;

    switch (ev.key) {
      case "Escape":
        ev.preventDefault();
        exitSelection();
        return;
      case "Backspace":
      case "Delete":
        ev.preventDefault();
        deleteSelection(true);
        return;
      case "ArrowUp":
      case "ArrowDown": {
        if (!ev.shiftKey) return;

        ev.preventDefault();
        const added = selection.extend(ev.key === "ArrowDown" ? 1 : -1);
        if (added) inputRefs.get(rowKey(added))?.scrollIntoView({ block: "nearest" });
        return;
      }
    }

    // Space must still activate the banner buttons.
    const isCharacter = ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey;
    if (isCharacter && !(ev.target instanceof HTMLButtonElement)) ev.preventDefault();
  });

  // Fills the range from the last row, in case the pointer moved over several
  // rows between two events.
  const dragOver = (gesture: { last: Row }, row: Row) => {
    selection.dragTo(gesture.last, row);
    gesture.last = row;
  };

  let drag: { start: Row; last: Row; moved: boolean } | null = null;

  const onListPointerDown = (ev: PointerEvent) => {
    suppressNextClick = false;
    drag = null;

    if (ev.pointerType !== "mouse" || ev.button !== 0 || ev.shiftKey) return;

    const row = rowFromElement(ev.target as Element);
    if (!row || (!selection.active() && row.kind !== "item")) return;

    drag = { start: row, last: row, moved: false };
  };

  const onListPointerMove = (ev: PointerEvent) => {
    if (!drag || ev.pointerType !== "mouse" || (ev.buttons & 1) === 0) return;

    const row = rowAtPoint(ev.clientX, ev.clientY);
    if (!row || sameRow(row, drag.last)) return;

    if (!drag.moved) {
      drag.moved = true;
      if (!selection.active() && drag.start.kind === "item") enterSelection(drag.start);
    }

    dragOver(drag, row);
    getSelection()?.removeAllRanges();
  };

  const endDrag = () => {
    if (drag?.moved) suppressNextClick = true;
    drag = null;
  };
  makeEventListener(window, "pointerup", endDrag);
  makeEventListener(window, "pointercancel", endDrag);

  const onListMouseDown = (ev: MouseEvent) => {
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
    enterSelection(focused);
    selection.shiftClick(clicked);
    suppressNextClick = true;
  };

  const onListClick = (ev: MouseEvent) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    if (!selection.active()) return;

    const row = rowFromElement(ev.target as Element);
    if (!row) return;

    if (ev.shiftKey && row.kind === "item") selection.shiftClick(row);
    else selection.toggle(row);
  };

  const onListFocusIn = (ev: FocusEvent) => {
    // Fallback in case an input or an item gets the focus in the mode anyway.
    const target = ev.target;
    if (selection.active() && target instanceof HTMLElement && target.matches("input, [contenteditable]")) {
      target.blur();
    }
  };

  let press: { row: Row; last: Row; x: number; y: number; timer: number; fired: boolean } | null = null;

  const cancelPress = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };

  const firePress = () => {
    if (!press || press.fired) return;

    clearTimeout(press.timer);
    press.fired = true;

    if (selection.active()) selection.press(press.row);
    else enterSelection(press.row);
  };

  const onListContextMenu = (ev: MouseEvent) => {
    if (!isLongPressTarget(ev.target as Element)) return;

    // A long press opens the context menu on Android. It may come before the
    // timer.
    ev.preventDefault();
    firePress();
  };

  onMount(() => {
    makeEventListener(
      containerRef,
      "touchstart",
      (ev) => {
        cancelPress();
        if (ev.touches.length !== 1) return;

        const target = ev.target as Element;
        const row = rowFromElement(target);
        if (!row || !isLongPressTarget(target)) return;

        const { clientX: x, clientY: y } = ev.touches[0];
        press = { row, last: row, x, y, timer: window.setTimeout(firePress, LongPressMs), fired: false };
      },
      { passive: true },
    );

    // Not passive, so that it can block scrolling during a drag.
    makeEventListener(
      containerRef,
      "touchmove",
      (ev) => {
        if (!press) return;

        const touch = ev.touches[0];
        if (!press.fired) {
          if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > LongPressMoveTolerancePx) cancelPress();
          return;
        }

        ev.preventDefault();

        const row = rowAtPoint(touch.clientX, touch.clientY);
        if (row && !sameRow(row, press.last)) dragOver(press, row);
      },
      { passive: false },
    );

    makeEventListener(
      containerRef,
      "touchend",
      (ev) => {
        // The click that follows a long press must not toggle the item, nor
        // its checkbox.
        if (press?.fired && ev.cancelable) ev.preventDefault();
        cancelPress();
      },
      { passive: false },
    );

    makeEventListener(containerRef, "touchcancel", cancelPress);
  });

  return (
    <>
      <div
        ref={(el) => {
          containerRef = el;
        }}
        class={cn(
          "flex-1 max-w-[40rem] p-4 bg-white flex flex-col gap-[0.8rem] overflow-auto",
          selection.active() && "select-none pb-28",
        )}
        onPointerDown={onListPointerDown}
        onPointerMove={onListPointerMove}
        onMouseDown={onListMouseDown}
        onClick={onListClick}
        onFocusIn={onListFocusIn}
        onContextMenu={onListContextMenu}
      >
        <header class="flex items-center gap-[0.2rem] text-[1.5rem] [&>*]:h-[1em] [&>*]:min-w-0">
          <A title="Back to lists" href="/" onClick={backToLists}>
            <ArrowLeft size="1em" />
          </A>
          <input
            ref={(el) => {
              nameInputRef = el;
              setInputRef(el);
            }}
            onKeyDown={(ev) => {
              onItemKeyDown(undefined, undefined, ev);
            }}
            type="text"
            class={cn(transparentInput, "flex-1 p-[0.3rem] pb-2 border-b border-b-[#999]")}
            value={props.list.name}
            placeholder="List name"
            readOnly={selection.active()}
          />
        </header>

        <For each={sections}>
          {(section, sectionIndex) => {
            const isLast = () => {
              return sectionIndex() === sections.length - 1;
            };

            const isTitleSelected = () => !isLast() && selection.isSelected({ kind: "title", s: sectionIndex() });

            return (
              <section class="flex-none flex flex-col">
                <div
                  class={cn(
                    "pl-8",
                    !isLast() && "select-none [-webkit-touch-callout:none]",
                    isTitleSelected() && selectedRow,
                  )}
                  data-section={isLast() ? undefined : sectionIndex()}
                  data-selected={isTitleSelected() ? "true" : undefined}
                >
                  <input
                    type="text"
                    ref={(el) => {
                      setInputRef(el, sectionIndex());
                    }}
                    class={cn(transparentInput, "w-full text-[1.2em] font-bold", !selection.active() && "select-text")}
                    placeholder={isLast() ? "New section…" : "Unnamed section"}
                    value={section.name}
                    readOnly={selection.active()}
                    onInput={(ev) => {
                      onSectionNameChanged(sectionIndex(), ev);
                    }}
                    onKeyDown={(ev) => {
                      onItemKeyDown(sectionIndex(), undefined, ev);
                    }}
                    role="heading"
                    aria-level="2"
                  />
                </div>
                <ul class="m-0 p-0 list-none leading-[1.7rem]">
                  <For each={section.items}>
                    {(item, itemIndex) => {
                      const isLastItem = () => {
                        return itemIndex() === section.items.length - 1;
                      };

                      const isItemSelected = () =>
                        !isLastItem() && selection.isSelected({ kind: "item", s: sectionIndex(), i: itemIndex() });

                      // The text is only set when the item is created: the
                      // contenteditable div owns it after that, and re-rendering
                      // it on each keystroke would move the caret.
                      const initialText = item.text;

                      // The padding on the left of the row is where a long
                      // press starts the selection mode on mobile, so it must
                      // be wide enough for a finger.
                      return (
                        <li
                          class={cn(
                            "flex flex-row items-start gap-2 pl-10",
                            !isLastItem() && "select-none [-webkit-touch-callout:none]",
                            isItemSelected() && selectedRow,
                          )}
                          data-section={isLastItem() ? undefined : sectionIndex()}
                          data-item={isLastItem() ? undefined : itemIndex()}
                          data-selected={isItemSelected() ? "true" : undefined}
                        >
                          {!isLastItem() && (
                            <input
                              type="checkbox"
                              class="flex-none mt-2"
                              checked={item.checked}
                              onClick={(ev) => {
                                if (selection.active()) ev.preventDefault();
                              }}
                              onChange={(ev) => {
                                onItemValueChanged(sectionIndex(), itemIndex(), ev);
                              }}
                            />
                          )}
                          <div
                            contenteditable={selection.active() ? "false" : "true"}
                            ref={(el) => {
                              setInputRef(el, sectionIndex(), itemIndex());
                            }}
                            class={cn(
                              transparentInput,
                              "flex-1",
                              !selection.active() && "select-text",
                              isLastItem() && "new-item",
                            )}
                            onInput={(ev) => {
                              onItemTextChanged(sectionIndex(), itemIndex(), ev);
                            }}
                            onKeyDown={(ev) => {
                              onItemKeyDown(sectionIndex(), itemIndex(), ev);
                            }}
                          >
                            {initialText}
                          </div>
                        </li>
                      );
                    }}
                  </For>
                </ul>
              </section>
            );
          }}
        </For>
      </div>

      <Show when={selection.active()}>
        <SelectionBanner
          summary={selection.summary()}
          checkAction={selection.checkAction()}
          canDelete={!selection.isEmpty()}
          onToggleChecked={toggleSelectedChecked}
          onDelete={() => deleteSelection(lastPointerType !== "touch")}
          onDone={exitSelection}
        />
      </Show>
    </>
  );
};

export const List: Component<{ id: string }> = (props) => {
  const listId = props.id;
  const { getLists } = useLists();
  const findList = () => getLists()?.find((x) => x.id === listId);

  return (
    <Switch>
      <Match when={getLists.error !== undefined}>
        <>💣 There was an error loading this list</>
      </Match>
      <Match when={getLists.latest === undefined}>
        <>🕒 Loading…</>
      </Match>
      <Match when={findList() === undefined}>
        <>&#128373;&#65039; This list was not found :-/</>
      </Match>
      <Match when={findList() !== undefined}>
        <ListLoaded list={findList()!} />
      </Match>
    </Switch>
  );
};
