import { Component, For, onCleanup, Match, Switch } from "solid-js";
import { A } from "@solidjs/router";
import { makeEventListener } from "@solid-primitives/event-listener";

import { useLists } from "./ListStore";
import styles from "./List.module.css";
import { ArrowLeft } from "./icons/ArrowLeft";
import { List as ListSchema, Section } from "./list-schema";
import { createListEditor } from "./ListEditor";

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

const ListLoaded: Component<{ list: ListSchema }> = (props) => {
  const { updateList } = useLists();

  let nameInputRef: HTMLInputElement;

  const {
    sections,
    changes,
    clearChanges,

    renameList,
    appendSection,
    renameSection,
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

  function restoreCaretPositionAtNextTick(inputRefPath: string) {
    const selectionEnd = getSelection()?.getRangeAt(0).endOffset ?? 0;
    if (selectionEnd === undefined) return;

    const afterTick = () => {
      inputRefs.get(inputRefPath)?.focus();

      const newSelectionRange = getSelection()?.getRangeAt(0);
      newSelectionRange?.setStart(newSelectionRange.endContainer, selectionEnd);
      newSelectionRange?.setEnd(newSelectionRange.endContainer, selectionEnd);
    };

    setTimeout(afterTick, 0);
  }

  const onSectionNameChanged = (idx: number, ev: Event) => {
    const input = ev.target as HTMLInputElement;
    const name = input.value ?? "";

    if (idx === sections.length - 1) {
      input.value = ""; // reset the value since a new section will be appended
      restoreCaretPositionAtNextTick(inputRefPath(idx));
      appendSection(name);
    } else {
      renameSection(idx, name);
    }
  };

  const insertItem = (sectionIdx: number, itemIdx: number, text: string) => {
    const nItemsBeforeAppend = sections[sectionIdx].items.length;

    // Poke a "hole" in the index *before* calling setSections, so that the new
    // ref does not override an existing value.
    for (let i = nItemsBeforeAppend - 1; i >= itemIdx; --i) {
      const el = inputRefs.get(inputRefPath(sectionIdx, i));
      if (!el) continue;
      inputRefs.set(inputRefPath(sectionIdx, 1 + i), el);
    }

    appendItem(sectionIdx, itemIdx, text);
  };

  const onItemTextChanged = (sectionIdx: number, itemIdx: number, ev: Event) => {
    const target = ev.target as HTMLElement;
    const text = target.textContent ?? "";

    if (itemIdx === sections[sectionIdx].items.length - 1) {
      restoreCaretPositionAtNextTick(inputRefPath(sectionIdx, itemIdx));
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
    let path: string | undefined;

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

        if (sectionIdx === undefined || itemIdx === undefined) return;

        // We filter out backspace event on the last item of a section, which
        // is always the "New item" placeholder.
        if (itemIdx !== sections[sectionIdx].items.length - 1 && sections[sectionIdx].items[itemIdx].text === "") {
          // Focus the element before the one we just deleted.
          path = previousInputRefPath(sections, sectionIdx, itemIdx);

          const nItemsBeforeDeletion = sections[sectionIdx].items.length;

          deleteItem(sectionIdx, itemIdx);

          // Reindex the items in the section
          for (let i = itemIdx; i < nItemsBeforeDeletion; i++) {
            const el = inputRefs.get(inputRefPath(sectionIdx, i + 1));
            if (!el) continue;
            inputRefs.set(inputRefPath(sectionIdx, i), el);
          }

          inputRefs.delete(inputRefPath(sectionIdx, nItemsBeforeDeletion - 1));
        }
        break;
      case "Enter":
        const targetSectionIdx = sectionIdx ?? 0;
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
    inputRefs.get(path)?.focus();
  };

  return (
    <div class={styles.Content}>
      <header class={styles.Header}>
        <A title="Back to lists" class={styles.GoBack} href="/">
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
          class={`${styles.TransparentInput} ${styles.Name}`}
          value={props.list.name}
          placeholder="List name"
        />
      </header>

      <For each={sections}>
        {(section, sectionIndex) => {
          const isLast = () => {
            return sectionIndex() === sections.length - 1;
          };

          return (
            <section class={styles.Section}>
              <input
                type="text"
                ref={(el) => {
                  setInputRef(el, sectionIndex());
                }}
                class={`${styles.TransparentInput} ${styles.SectionName}`}
                placeholder={isLast() ? "New section…" : "Unnamed section"}
                value={section.name}
                onInput={(ev) => {
                  onSectionNameChanged(sectionIndex(), ev);
                }}
                onKeyDown={(ev) => {
                  onItemKeyDown(sectionIndex(), undefined, ev);
                }}
                role="heading"
                aria-level="2"
              />
              <ul class={styles.Items}>
                <For each={section.items}>
                  {(item, itemIndex) => {
                    const isLastItem = () => {
                      return itemIndex() === section.items.length - 1;
                    };

                    return (
                      <li class={styles.Item}>
                        {!isLastItem() && (
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(ev) => {
                              onItemValueChanged(sectionIndex(), itemIndex(), ev);
                            }}
                          />
                        )}
                        <div
                          contenteditable
                          ref={(el) => {
                            setInputRef(el, sectionIndex(), itemIndex());
                          }}
                          class={`${styles.TransparentInput} ${isLastItem() ? styles.NewItem : ""}`}
                          onInput={(ev) => {
                            onItemTextChanged(sectionIndex(), itemIndex(), ev);
                          }}
                          onKeyDown={(ev) => {
                            onItemKeyDown(sectionIndex(), itemIndex(), ev);
                          }}
                        >
                          {/*@once*/ item.text}
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
