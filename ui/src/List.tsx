import { batch, Component, For, onCleanup, Match, Show, Switch } from "solid-js";
import { A } from "@solidjs/router";
import { makeEventListener } from "@solid-primitives/event-listener";

import { useLists } from "./ListStore";
import { ArrowLeft } from "./icons/ArrowLeft";
import { List as ListSchema } from "./list-schema";
import { createListEditor } from "./ListEditor";
import { cn } from "./cn";
import { createListSelection, Row, rowKey, selectableRows } from "./ListSelection";
import { createSelectionInput } from "./selection-input";
import { createInputRefs, inputRefPath, nextInputRefPath, previousInputRefPath } from "./input-refs";
import { SelectionBanner } from "./SelectionBanner";
import { useBackToLists } from "./back-to-lists";
import { listTitleTransitionName } from "./view-transition";

const selectedRow = "bg-[#b3d7ff]";

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

  const refs = createInputRefs();

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

  // Adds a section just before the "new section" placeholder.
  const addSection = (placeholder: HTMLElement, name: string) => {
    // The new section is rendered at the index of the placeholder, which moves
    // down by one. Its ref callback does not run again, so update its path by
    // hand before the new section registers its own ref.
    refs.set(placeholder, sections.length);
    appendSection(name);
  };

  const onSectionNameChanged = (idx: number, ev: Event) => {
    const input = ev.target as HTMLInputElement;
    const name = input.value ?? "";

    if (idx === sections.length - 1) {
      refs.restoreCaretPositionAtNextTick(input, inputRefPath(idx));
      input.value = ""; // reset the value since a new section will be appended
      addSection(input, name);
    } else {
      renameSection(idx, name);
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

    refs.remap((s, i) => {
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
    refs.remap((s, i) => inputRefPath(s, s === sectionIdx && i !== undefined && i >= itemIdx ? i + 1 : i));

    appendItem(sectionIdx, itemIdx, text);
  };

  const onItemTextChanged = (sectionIdx: number, itemIdx: number, ev: Event) => {
    const target = ev.target as HTMLElement;
    const text = target.textContent ?? "";

    if (itemIdx === sections[sectionIdx].items.length - 1) {
      refs.restoreCaretPositionAtNextTick(target, inputRefPath(sectionIdx, itemIdx));
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

      input.startFromKeyboard(sectionIdx, itemIdx, ev.key === "ArrowDown" ? 1 : -1, ev);
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

          const el = refs.get(inputRefPath(sectionIdx, itemIdx));
          if (el) el.textContent = truncatedText;
        }

        break;
      default:
        return;
    }

    if (path === undefined) return;

    ev.preventDefault();
    refs.focus(path, { caretAtEnd });
  };

  const selection = createListSelection(sections);

  const toggleSelectedChecked = () => {
    const checked = selection.checkAction() === "check";

    for (const { s, i } of selection.selectedItems()) {
      if (sections[s].items[i].checked !== checked) toggleItem(s, i, checked);
    }
  };

  const deleteSelection = (focusPrevious: boolean) => {
    if (selection.isEmpty()) return;

    const path = deleteRows(selection.isSelected);
    selection.stop();
    if (focusPrevious && path !== undefined) refs.focus(path, { caretAtEnd: true });
  };

  const input = createSelectionInput({
    sections,
    selection,
    onDelete: deleteSelection,
    scrollToRow: (row) => refs.get(rowKey(row))?.scrollIntoView({ block: "nearest" }),
  });

  return (
    <>
      <div
        ref={input.ref}
        class={cn(
          "flex-1 max-w-[40rem] p-4 bg-white flex flex-col gap-[0.8rem] overflow-auto",
          selection.active() && "select-none pb-28",
        )}
        onPointerDown={input.onPointerDown}
        onPointerMove={input.onPointerMove}
        onMouseDown={input.onMouseDown}
        onClick={input.onClick}
        onFocusIn={input.onFocusIn}
      >
        <header class="flex items-center gap-[0.2rem] text-[1.5rem] [&>*]:h-[1em] [&>*]:min-w-0">
          <A title="Back to lists" href="/" onClick={backToLists}>
            <ArrowLeft size="1em" />
          </A>
          {/* The border and padding are not on the input, so that they are not
              part of the title view transition. box-content keeps the input
              1em tall, the same height relative to its text as the title on the
              lists page. */}
          <div class="flex-1 flex box-content px-[0.3rem] border-b border-b-[#999]">
            <input
              ref={(el) => {
                nameInputRef = el;
                refs.set(el);
              }}
              onKeyDown={(ev) => {
                onItemKeyDown(undefined, undefined, ev);
              }}
              type="text"
              class={cn(transparentInput, "flex-1 min-w-0 p-0")}
              style={{ "view-transition-name": listTitleTransitionName(props.list.id) }}
              value={props.list.name}
              placeholder="List name"
              readOnly={selection.active()}
            />
          </div>
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
                      refs.set(el, sectionIndex());
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
                              refs.set(el, sectionIndex(), itemIndex());
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
          onDelete={() => deleteSelection(!input.lastPointerWasTouch())}
          onDone={selection.stop}
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
