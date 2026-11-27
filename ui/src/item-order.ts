import { Item, SortOrder } from "./list-schema";

const nameCollator = new Intl.Collator(undefined, { sensitivity: "accent", numeric: true });

const comparators: Record<SortOrder, (a: Item, b: Item) => number> = {
  name: (a, b) => nameCollator.compare(a.text, b.text),
};

// Returns the indexes of the items in their sorted order. The sort is stable:
// the editor and the stored document sort the same items separately, and must
// get the same order.
export function sortedOrder(items: readonly Item[], by: SortOrder): number[] {
  const compare = comparators[by];
  return items.map((_, i) => i).sort((a, b) => compare(items[a], items[b]));
}
