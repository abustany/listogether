import { describe, it } from "vitest";

import * as Automerge from "@automerge/automerge";

import { List } from "./list";

function editOnBothSides(
  base: Automerge.Doc<List>,
  left: (l: List) => void,
  right: (l: List) => void,
): Automerge.Doc<List> {
  let doc1 = Automerge.change(base, "edit", left);
  let doc2 = Automerge.change(Automerge.clone(base), "edit", right);
  const res = Automerge.merge(doc1, doc2);
  const conflicts = Automerge.getConflicts(res, "sections");
  if (conflicts) throw new Error(`there are conflicts! ${JSON.stringify(conflicts)}`);

  return res;
}

function deepCopy<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

describe("I have no idea what I'm doing", () => {
  it("handles conflicts", () => {
    let rootDoc = Automerge.init<List>();
    rootDoc = Automerge.change(rootDoc, "Add some data", (doc) => {
      doc.sections = [];
      doc.sections.push({ name: "Bio", items: [] });
      doc.sections.push({ name: "DM", items: [] });
    });

    const doc1 = editOnBothSides(
      rootDoc,
      (doc) => {
        doc.sections.find((x) => x.name === "Bio")?.items.push({ text: "Carrots", checked: false });
        doc.sections.find((x) => x.name === "DM")?.items.push({ text: "Maple syrup", checked: false });
      },
      (doc) => {
        doc.sections.find((x) => x.name === "DM")?.items.push({ text: "Hazelnuts", checked: false });
      },
    );

    const doc2 = editOnBothSides(
      doc1,
      (doc) => {
        let item = doc.sections.find((x) => x.name === "DM")?.items.find((x) => x.text === "Hazelnuts");
        if (item) item.checked = true;
      },
      (doc) => {
        let item = doc.sections.find((x) => x.name === "DM")?.items.find((x) => x.text === "Hazelnuts");
        if (item) item.text += " and walnuts";
        doc.sections.find((x) => x.name === "DM")?.items.splice(0, 0, { text: "Milk", checked: false });
      },
    );

    const doc3 = editOnBothSides(
      doc2,
      (doc) => {
        let updatedSections = deepCopy(doc.sections);
        updatedSections[0].items[0].checked = true;
        updatedSections = [...updatedSections, { name: "New section", items: [] }];
        doc.sections = updatedSections;
      },
      (doc) => {
        let updatedSections = deepCopy(doc.sections);
        let item = updatedSections.find((x) => x.name === "DM")?.items.find((x) => x.text === "Maple syrup");
        if (item) item.checked = true;
        doc.sections = updatedSections;
      },
    );

    console.log(JSON.stringify(doc3));
  });
});
