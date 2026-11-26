import { Section } from "./list-schema";

// Computes a string "address" for a given input element. This is used to
// address the HTML input elements in a map.
//
// The syntax of an input ref path is SECTION_IDX for sections, or
// SECTION_IDX.ITEM_IDX for items. All indexes are 0-based. As a special case,
// the empty input ref path represents the note title field.
export function inputRefPath(sectionIdx?: number, itemIdx?: number): string {
  if (sectionIdx === undefined) return "";
  return `${sectionIdx}${itemIdx === undefined ? "" : `.${itemIdx}`}`;
}

export function previousInputRefPath(
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

export function nextInputRefPath(
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

// The editor elements (list name, section names and items), by input ref path.
// Ref callbacks only run when an element is created, so the paths must be
// updated by hand when sections or items are inserted or deleted.
export function createInputRefs() {
  const refs = new Map<string, HTMLElement>();

  return {
    get: (path: string) => refs.get(path),

    set(el: HTMLElement, sectionIdx?: number, itemIdx?: number) {
      refs.set(inputRefPath(sectionIdx, itemIdx), el);
    },

    remap(newPath: (s: number, i?: number) => string | undefined) {
      const entries = [...refs.entries()];
      refs.clear();

      for (const [path, el] of entries) {
        // The empty path is the list name, which never moves.
        if (path === "") {
          refs.set(path, el);
          continue;
        }

        const [s, i] = path.split(".").map(Number);
        const p = newPath(s, i);
        if (p !== undefined) refs.set(p, el);
      }
    },

    focus(path: string, options?: { caretAtEnd?: boolean }) {
      const el = refs.get(path);
      if (!el) return;

      el.focus();
      if (options?.caretAtEnd) moveCaretToEnd(el);
    },

    // Moves the focus to the element at path once it has been rendered,
    // keeping the caret at the same offset as in source.
    restoreCaretPositionAtNextTick(source: HTMLElement, path: string) {
      // Text inputs have their own selection, which is not reflected in the
      // document selection.
      const selectionEnd =
        source instanceof HTMLInputElement
          ? (source.selectionEnd ?? 0)
          : (getSelection()?.getRangeAt(0).endOffset ?? 0);

      const afterTick = () => {
        const el = refs.get(path);
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
    },
  };
}
