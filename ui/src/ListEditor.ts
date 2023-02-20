import { createStore } from "solid-js/store";

import { Item, List as ListSchema, ListChange, Section } from "./list-schema";

function newItemSentinel(): Item {
  return { text: "", checked: false };
}

function appendSentinels(sections: Section[]): Section[] {
  return [
    ...sections.map((section) => ({
      ...section,
      items: [...section.items, newItemSentinel()],
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

export function createListEditor(list: ListSchema) {
  const [sections, setSections] = createStore<Section[]>(appendSentinels(list.sections));
  const changes: ListChange[] = [];

  return {
    changes,
    sections,

    // List
    renameList(name: string) {
      changes.push({ type: "name-change", name });
    },

    // Sections

    appendSection(name: string) {
      changes.push({ type: "append-section", name });
      const updatedSections = [...sections];
      updatedSections.splice(updatedSections.length - 1, 0, { name, items: [newItemSentinel()] });
      setSections(updatedSections);
    },

    renameSection(idx: number, name: string) {
      appendChange(changes, { type: "rename-section", idx, name }, (c) => c.idx === idx);
      setSections(idx, "name", name);
    },

    // Items

    appendItem(sectionIdx: number, itemIdx: number, text: string) {
      changes.push({ type: "append-item", sectionIdx, itemIdx, text });

      const updatedItems = [...sections[sectionIdx].items];
      updatedItems.splice(itemIdx, 0, { text, checked: false });
      setSections(sectionIdx, "items", updatedItems);
    },

    renameItem(sectionIdx: number, itemIdx: number, text: string) {
      appendChange(
        changes,
        { type: "rename-item", sectionIdx, itemIdx, text },
        (c) => c.sectionIdx === sectionIdx && c.itemIdx === itemIdx,
      );
      setSections(sectionIdx, "items", itemIdx, "text", text);
    },

    deleteItem(sectionIdx: number, itemIdx: number) {
      appendChange(
        changes,
        { type: "delete-item", sectionIdx, itemIdx },
        (_c) => false, // we never coalesce deletions
      );

      const updatedItems = [...sections[sectionIdx].items];
      updatedItems.splice(itemIdx, 1);
      setSections(sectionIdx, "items", updatedItems);
    },

    toggleItem(sectionIdx: number, itemIdx: number, checked: boolean) {
      appendChange(
        changes,
        { type: "update-item", sectionIdx, itemIdx, checked },
        (c) => c.sectionIdx === sectionIdx && c.itemIdx === itemIdx,
      );
      setSections(sectionIdx, "items", itemIdx, "checked", checked);
    },
  };
}
