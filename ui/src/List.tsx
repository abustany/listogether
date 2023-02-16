import { Component, For, onCleanup, Match, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { A } from "@solidjs/router";

import { useLists } from "./ListStore";
import styles from "./List.module.css";
import { ArrowLeft } from "./icons/ArrowLeft";
import { Item, List as ListSchema, ListChange, Section } from "./list-schema";

function ensureSentinel<T>(items: T[], isSentinel: (x: T) => boolean, makeSentinel: () => T): T[] {
  if (items.length > 0 && isSentinel(items[items.length - 1])) return items;
  return [...items, makeSentinel()];
}

function ensureItemsSentinel(items: Item[]): Item[] {
  return ensureSentinel(
    items,
    (x) => x.text === "" && x.checked === false,
    () => ({ text: "", checked: false }),
  );
}

function appendSentinels(sections: Section[]): Section[] {
  return [
    ...sections.map((section) => ({
      ...section,
      items: [...section.items, { text: "", checked: false }],
    })),
    { name: "", items: [] },
  ];
}

function appendChange<T extends ListChange["type"]>(
  changes: ListChange[],
  change: Extract<ListChange, { type: T }>,
  canMergeIntoLastChange: (lastChange: Extract<ListChange, { type: T }>) => boolean,
): void {
  const lastChange = changes.length > 0 ? changes[changes.length - 1] : undefined;

  if (lastChange?.type === change.type && canMergeIntoLastChange(lastChange as Extract<ListChange, { type: T }>)) {
    changes[changes.length - 1] = change;
  } else {
    changes.push(change);
  }
}

// Computes a string "address" for a given input element. This is used to
// address the HTML input elements in a map.
function inputRefPath(sectionIdx?: number, itemIdx?: number): string {
  if (sectionIdx === undefined) return "";
  return `${sectionIdx}` + (itemIdx === undefined ? "" : `.${itemIdx}`);
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

  const [sections, setSections] = createStore<Section[]>(appendSentinels(props.list.sections));
  const changes: ListChange[] = [];

  // Maps inputRefPath of each element to the element
  const inputRefs = new Map<string, HTMLElement>();
  const setInputRef = (el: HTMLElement, sectionIdx?: number, itemIdx?: number) => {
    inputRefs.set(inputRefPath(sectionIdx, itemIdx), el);
  };

  onCleanup(() => {
    if (props.list.name !== nameInputRef.value) {
      changes.push({ type: "name-change", name: nameInputRef.value });
    }

    updateList(props.list.id, changes);
  });

  const renameSection = (idx: number, name: string) =>
    appendChange(changes, { type: "rename-section", idx, name }, (c) => c.idx === idx);

  const renameItem = (sectionIdx: number, itemIdx: number, text: string) =>
    appendChange(
      changes,
      { type: "rename-item", sectionIdx, itemIdx, text },
      (c) => c.sectionIdx === sectionIdx && c.itemIdx === itemIdx,
    );

  const updateItem = (sectionIdx: number, itemIdx: number, checked: boolean) =>
    appendChange(
      changes,
      { type: "update-item", sectionIdx, itemIdx, checked },
      (c) => c.sectionIdx === sectionIdx && c.itemIdx === itemIdx,
    );

  const deleteItem = (sectionIdx: number, itemIdx: number) => {
    // 1. delete the item from our local copy
    const updatedItems = [...sections[sectionIdx].items];
    const nItemsBeforeDeletion = updatedItems.length;
    updatedItems.splice(itemIdx, 1);
    setSections(sectionIdx, "items", updatedItems);

    // 2. record the change
    appendChange(
      changes,
      { type: "delete-item", sectionIdx, itemIdx },
      (_c) => false, // we never coalesce deletions
    );

    // 3. reindex the items in the section
    for (let i = itemIdx; i < nItemsBeforeDeletion; i++) {
      const el = inputRefs.get(inputRefPath(sectionIdx, i + 1));
      if (!el) continue;
      inputRefs.set(inputRefPath(sectionIdx, i), el);
    }

    inputRefs.delete(inputRefPath(sectionIdx, nItemsBeforeDeletion - 1));
  };

  const onSectionNameChanged = (idx: number, ev: Event) => {
    const name = (ev.target as HTMLInputElement).value ?? "";
    const items = ensureItemsSentinel(sections[idx].items);

    setSections(idx, { name, items });

    if (idx === sections.length - 1) {
      changes.push({ type: "append-section", name });
      setSections([...sections, { name: "", items: [] }]);
    } else {
      renameSection(idx, name);
    }
  };

  const appendItem = (sectionIdx: number, itemIdx: number, text: string) => {
    const updatedItems = [...sections[sectionIdx].items];
    const nItemsBeforeAppend = updatedItems.length;

    changes.push({ type: "append-item", sectionIdx, itemIdx, text });

    // Poke a "hole" in the index *before* calling setSections, so that the new
    // ref does not override an existing value.
    for (let i = nItemsBeforeAppend - 1; i >= itemIdx; --i) {
      const el = inputRefs.get(inputRefPath(sectionIdx, i));
      if (!el) continue;
      inputRefs.set(inputRefPath(sectionIdx, 1 + i), el);
    }

    updatedItems.splice(itemIdx, 0, { text, checked: false });
    setSections(sectionIdx, "items", updatedItems);
  };

  const onItemTextChanged = (sectionIdx: number, itemIdx: number, ev: Event) => {
    const text = (ev.target as HTMLElement).textContent ?? "";

    setSections(sectionIdx, "items", itemIdx, "text", text);

    if (itemIdx === sections[sectionIdx].items.length - 1) {
      appendItem(sectionIdx, itemIdx, text);

      // Reset the text of the placeholder
      setSections(sectionIdx, "items", itemIdx + 1, "text", "");

      // And focus the just-spliced field
      inputRefs.get(inputRefPath(sectionIdx, itemIdx))?.focus();
    } else {
      renameItem(sectionIdx, itemIdx, text);
    }
  };

  const onItemValueChanged = (sectionIdx: number, itemIdx: number, ev: Event) => {
    const checked = (ev.target as HTMLInputElement).checked;
    setSections(sectionIdx, "items", itemIdx, "checked", checked);
    updateItem(sectionIdx, itemIdx, checked);
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
        //
        // We filter out backspace event on the last item of a section, which
        // is always the "New item" placeholder.
        if (
          sectionIdx !== undefined &&
          itemIdx !== undefined &&
          itemIdx != sections[sectionIdx].items.length - 1 &&
          sections[sectionIdx].items[itemIdx].text === ""
        ) {
          // Focus the element before the one we just deleted.
          path = previousInputRefPath(sections, sectionIdx, itemIdx);

          deleteItem(sectionIdx, itemIdx);
        }
        break;
      case "Enter":
        const targetSectionIdx = sectionIdx ?? 0;
        const targetItemIdx = itemIdx !== undefined ? 1 + itemIdx : 0;
        appendItem(targetSectionIdx, targetItemIdx, "");
        path = inputRefPath(targetSectionIdx, targetItemIdx);
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
        <A class={styles.GoBack} href="/">
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
        <>🕵️ This list was not found :-/</>
      </Match>
      <Match when={findList() !== undefined}>
        <ListLoaded list={findList()!} />
      </Match>
    </Switch>
  );
};
