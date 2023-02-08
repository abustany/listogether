export interface Item {
  text: string;
  checked: boolean;
}

export interface Section {
  name: string;
  items: Item[];
}

export interface List {
  id: string;
  name: string;
  sections: Section[];
}

export type ListChange =
  | { type: "name-change"; name: string }
  | { type: "append-section"; name: string }
  | { type: "rename-section"; idx: number; name: string }
  | { type: "append-item"; sectionIdx: number; text: string }
  | { type: "rename-item"; sectionIdx: number; itemIdx: number; text: string }
  | {
      type: "update-item";
      sectionIdx: number;
      itemIdx: number;
      checked: boolean;
    }
  | { type: "delete-item"; sectionIdx: number; itemIdx: number };
