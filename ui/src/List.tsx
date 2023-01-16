import { Component, For, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { A } from "@solidjs/router";

import { useLists } from "./ListStore";
import styles from "./List.module.css";
import { ArrowLeft } from "./icons/ArrowLeft";
import { Item, ListChange, Section } from "./list-schema";

interface ListProps {
  id: string; // ID of the list
}

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

export const List: Component<ListProps> = (props) => {
  const { getLists, updateList } = useLists();
  const lists = getLists();
  const list = lists.find((x) => x.id === props.id);
  let nameInputRef: HTMLInputElement;

  if (list === undefined) {
    return <>We could not find a list with ID {props.id}</>;
  }

  const [sections, setSections] = createStore<Section[]>(appendSentinels(list.sections));
  const changes: ListChange[] = [];

  onCleanup(() => {
    if (list.name !== nameInputRef.value) {
      changes.push({ type: "name-change", name: nameInputRef.value });
    }

    updateList(list.id, changes);
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

  const onSectionNameChanged = (idx: number, ev: Event) => {
    const name = (ev.target as HTMLInputElement).value;
    const items = ensureItemsSentinel(sections[idx].items);

    setSections(idx, { name, items });

    if (idx === sections.length - 1) {
      changes.push({ type: "append-section", name });
      setSections([...sections, { name: "", items: [] }]);
    } else {
      renameSection(idx, name);
    }
  };

  const onItemTextChanged = (sectionIdx: number, itemIdx: number, ev: Event) => {
    const text = (ev.target as HTMLInputElement).value;

    setSections(sectionIdx, "items", itemIdx, "text", text);

    if (itemIdx === sections[sectionIdx].items.length - 1) {
      changes.push({ type: "append-item", sectionIdx, text });
      setSections(sectionIdx, "items", (items) => [...items, { text: "", checked: false }]);
    } else {
      renameItem(sectionIdx, itemIdx, text);
    }
  };

  const onItemValueChanged = (sectionIdx: number, itemIdx: number, ev: Event) => {
    const checked = (ev.target as HTMLInputElement).checked;
    setSections(sectionIdx, "items", itemIdx, "checked", checked);
    updateItem(sectionIdx, itemIdx, checked);
  };

  return (
    <div class={styles.Content}>
      <header class={styles.Header}>
        <A class={styles.GoBack} href="/">
          <ArrowLeft size="1em" />
        </A>
        <input
          ref={nameInputRef!}
          type="text"
          class={`${styles.TransparentInput} ${styles.Name}`}
          value={list.name}
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
                class={`${styles.TransparentInput} ${styles.SectionName}`}
                placeholder={isLast() ? "New section…" : "Unnamed section"}
                value={section.name}
                onInput={(ev) => {
                  onSectionNameChanged(sectionIndex(), ev);
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
                      <li>
                        {!isLastItem() && (
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(ev) => {
                              onItemValueChanged(sectionIndex(), itemIndex(), ev);
                            }}
                          />
                        )}
                        <input
                          type="text"
                          class={`${styles.TransparentInput}`}
                          placeholder="New item…"
                          value={item.text}
                          onInput={(ev) => {
                            onItemTextChanged(sectionIndex(), itemIndex(), ev);
                          }}
                        />
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
