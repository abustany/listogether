import { createMemo, createSignal } from "solid-js";

import { Section } from "./list-schema";

// The "New section…" and "new item" placeholders cannot be selected, so they
// are never rows.
export type ItemRow = { kind: "item"; s: number; i: number };
export type TitleRow = { kind: "title"; s: number };
export type Row = ItemRow | TitleRow;

// Must match the input ref paths in List.tsx, which looks up elements by row
// key.
export function rowKey(row: Row): string {
  return row.kind === "title" ? `${row.s}` : `${row.s}.${row.i}`;
}

export function sameRow(a: Row, b: Row): boolean {
  return rowKey(a) === rowKey(b);
}

function parseItemKey(key: string): ItemRow {
  const [s, i] = key.split(".").map(Number);
  return { kind: "item", s, i };
}

// In document order. The sections include the editor sentinels: the last
// section is the "New section…" placeholder, and the last item of each section
// is its "new item" placeholder.
export function selectableRows(sections: Section[]): Row[] {
  const rows: Row[] = [];

  for (let s = 0; s < sections.length - 1; s++) {
    rows.push({ kind: "title", s });
    for (let i = 0; i < sections[s].items.length - 1; i++) rows.push({ kind: "item", s, i });
  }

  return rows;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// The anchors of Shift+click and Shift+Arrow. The mode always starts from a
// row, so they are always set. They are a title only when the mode started
// from that title (long press on mobile): later clicks on titles do not move
// them.
type ActiveState = {
  mode: "active";
  items: ReadonlySet<string>;
  titles: ReadonlySet<number>;
  lastClicked: Row;
  lastAdded: Row;
};

type SelectionState = { mode: "inactive" } | ActiveState;

const NoItems: ReadonlySet<string> = new Set();
const NoTitles: ReadonlySet<number> = new Set();

const itemKeysOf = (sections: Section[], s: number) =>
  sections[s].items.slice(0, -1).map((_, i) => rowKey({ kind: "item", s, i }));

function isSelectedIn(state: ActiveState, row: Row): boolean {
  return row.kind === "item" ? state.items.has(rowKey(row)) : state.titles.has(row.s);
}

function withSelected(sections: Section[], state: ActiveState, rows: Row[]): ActiveState {
  const items = new Set(state.items);
  const titles = new Set(state.titles);

  for (const row of rows) {
    if (row.kind === "item") {
      items.add(rowKey(row));
    } else {
      titles.add(row.s);
      for (const key of itemKeysOf(sections, row.s)) items.add(key);
    }
  }

  return { ...state, items, titles };
}

function withAnchorsOn(state: ActiveState, row: Row): ActiveState {
  return row.kind === "item" ? { ...state, lastClicked: row, lastAdded: row } : state;
}

function withUnselected(sections: Section[], state: ActiveState, row: Row): ActiveState {
  const items = new Set(state.items);
  const titles = new Set(state.titles);

  // A title stays selected only while all items of its section are.
  titles.delete(row.s);
  for (const key of row.kind === "item" ? [rowKey(row)] : itemKeysOf(sections, row.s)) items.delete(key);

  return { ...state, items, titles };
}

function rowsBetween(sections: Section[], from: Row, to: Row, withTitles: boolean): Row[] {
  const rows = selectableRows(sections);
  let a = rows.findIndex((r) => sameRow(r, from));
  let b = rows.findIndex((r) => sameRow(r, to));
  if (a < 0 || b < 0) return [];
  if (a > b) [a, b] = [b, a];

  return rows.slice(a, b + 1).filter((row) => row.kind === "item" || withTitles);
}

function nextItem(sections: Section[], from: Row, dir: 1 | -1): ItemRow | undefined {
  const rows = selectableRows(sections);
  const idx = rows.findIndex((r) => sameRow(r, from));
  if (idx < 0) return undefined;

  for (let k = idx + dir; k >= 0 && k < rows.length; k += dir) {
    const row = rows[k];
    if (row.kind === "item") return row;
  }

  return undefined;
}

// Rows are addressed by index. This is safe because nothing can be edited
// while the mode is on, so the indexes only change when the selection is
// deleted, and the mode exits then.
export function createListSelection(sections: Section[]) {
  const [state, setState] = createSignal<SelectionState>({ mode: "inactive" });

  // Many bindings only depend on whether the mode is on. The memo notifies
  // them only when that changes, not on every selection change.
  const active = createMemo(() => state().mode === "active");

  // Changes to the selection are ignored while the mode is off.
  const update = (fn: (state: ActiveState) => ActiveState) => {
    const current = state();
    if (current.mode === "active") setState(fn(current));
  };

  const items = () => {
    const current = state();
    return current.mode === "active" ? current.items : NoItems;
  };

  const titles = () => {
    const current = state();
    return current.mode === "active" ? current.titles : NoTitles;
  };

  const isSelected = (row: Row) => {
    const current = state();
    return current.mode === "active" && isSelectedIn(current, row);
  };

  const selectedItems = (): ItemRow[] => [...items()].map(parseItemKey);

  return {
    active,
    isSelected,

    start(from: Row) {
      const empty: ActiveState = {
        mode: "active",
        items: NoItems,
        titles: NoTitles,
        lastClicked: from,
        lastAdded: from,
      };
      setState(withSelected(sections, empty, [from]));
    },

    stop() {
      setState({ mode: "inactive" });
    },

    toggle(row: Row) {
      update((current) =>
        withAnchorsOn(
          isSelectedIn(current, row) ? withUnselected(sections, current, row) : withSelected(sections, current, [row]),
          row,
        ),
      );
    },

    press(row: Row) {
      update((current) => withAnchorsOn(withSelected(sections, current, [row]), row));
    },

    dragTo(from: Row, to: Row) {
      update((current) => {
        const next = withSelected(sections, current, rowsBetween(sections, from, to, true));
        return to.kind === "item" ? { ...next, lastAdded: to } : next;
      });
    },

    shiftClick(to: ItemRow) {
      update((current) =>
        withAnchorsOn(withSelected(sections, current, rowsBetween(sections, current.lastClicked, to, false)), to),
      );
    },

    extend(dir: 1 | -1): ItemRow | undefined {
      const current = state();
      if (current.mode !== "active") return undefined;

      const next = nextItem(sections, current.lastAdded, dir);
      if (!next) return undefined;

      setState({ ...withSelected(sections, current, [next]), lastAdded: next });
      return next;
    },

    itemAbovePlaceholder(s: number): ItemRow | undefined {
      return selectableRows(sections).findLast((r): r is ItemRow => r.kind === "item" && r.s <= s);
    },

    selectedItems,
    isEmpty: () => items().size === 0 && titles().size === 0,

    summary(): string {
      const selectedTitles = titles();
      const nItems = selectedItems().filter((row) => !selectedTitles.has(row.s)).length;

      const parts = [];
      if (selectedTitles.size > 0) parts.push(plural(selectedTitles.size, "section"));
      if (nItems > 0) parts.push(plural(nItems, "item"));

      return parts.length > 0 ? `${parts.join(" and ")} selected` : "Nothing selected";
    },

    checkAction(): "check" | "uncheck" | null {
      const selected = selectedItems();
      if (selected.length === 0) return null;
      return selected.some(({ s, i }) => !sections[s].items[i].checked) ? "check" : "uncheck";
    },
  };
}
