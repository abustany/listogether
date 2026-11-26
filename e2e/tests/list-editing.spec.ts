import { expect, test } from "fixtures/test";
import { addItem, addSection, createList, expectList, locators, reopenList } from "fixtures/list";

test("List editing", async ({ page }) => {
  const l = locators(page);
  const ListName = "Groceries";

  await createList(page);

  await test.step("Set the list name", async () => {
    await l.listName.fill(ListName);
    await expectList(page, ListName, []);
  });

  await test.step("Add a section", async () => {
    await addSection(page, "Fruits");
    await expectList(page, ListName, [{ name: "Fruits", items: [] }]);
  });

  await test.step("Type in the new item placeholder", async () => {
    await addItem(page, 0, "Apples");
    await expectList(page, ListName, [{ name: "Fruits", items: ["Apples"] }]);
    await expect(l.item(0, 0)).toBeFocused();
  });

  await test.step("Press Enter at the end of an item", async () => {
    await page.keyboard.press("Enter");
    await expectList(page, ListName, [{ name: "Fruits", items: ["Apples", ""] }]);
    await expect(l.item(0, 1)).toBeFocused();

    await page.keyboard.type("Pears");
    await expectList(page, ListName, [{ name: "Fruits", items: ["Apples", "Pears"] }]);
  });

  await test.step("Press Enter in the middle of an item", async () => {
    await page.keyboard.press("Enter");
    await page.keyboard.type("BananasCherries");
    for (let i = 0; i < "Cherries".length; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");

    await expectList(page, ListName, [{ name: "Fruits", items: ["Apples", "Pears", "Bananas", "Cherries"] }]);
    await expect(l.item(0, 3)).toBeFocused();
  });

  await test.step("Edit an existing item", async () => {
    await l.item(0, 1).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" and plums");
    await expectList(page, ListName, [{ name: "Fruits", items: ["Apples", "Pears and plums", "Bananas", "Cherries"] }]);
  });

  await test.step("Rename an existing section", async () => {
    await l.sectionName(0).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" and vegetables");
    await expectList(page, ListName, [
      { name: "Fruits and vegetables", items: ["Apples", "Pears and plums", "Bananas", "Cherries"] },
    ]);
  });

  await test.step("Check and uncheck items", async () => {
    await l.checkbox(0, 0).check();
    await l.checkbox(0, 3).check();
    await expectList(page, ListName, [
      {
        name: "Fruits and vegetables",
        items: [{ text: "Apples", checked: true }, "Pears and plums", "Bananas", { text: "Cherries", checked: true }],
      },
    ]);

    await l.checkbox(0, 3).uncheck();
    await expectList(page, ListName, [
      {
        name: "Fruits and vegetables",
        items: [{ text: "Apples", checked: true }, "Pears and plums", "Bananas", "Cherries"],
      },
    ]);
  });

  await test.step("Add a second section with items", async () => {
    await addSection(page, "Bakery");
    await addItem(page, 1, "Bread");

    await expectList(page, ListName, [
      {
        name: "Fruits and vegetables",
        items: [{ text: "Apples", checked: true }, "Pears and plums", "Bananas", "Cherries"],
      },
      { name: "Bakery", items: ["Bread"] },
    ]);
  });

  await test.step("Press Backspace in an empty item", async () => {
    await l.item(0, 1).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");

    // Removing the last character does not delete the item
    await expect(l.item(0, 1)).toHaveText("");
    await expect(l.items(0)).toHaveCount(5);

    // Backspace in the now empty item deletes it and focuses the previous item
    await page.keyboard.press("Backspace");
    await expect(l.item(0, 0)).toBeFocused();

    // The caret is at the end of the previous item
    await page.keyboard.type("!");
    await expect(l.item(0, 0)).toHaveText("Apples!");
    await page.keyboard.press("Backspace");
    await expect(l.item(0, 0)).toHaveText("Apples");

    // The items after the deleted one are still reachable with the keyboard
    await page.keyboard.press("ArrowDown");
    await expect(l.item(0, 1)).toBeFocused();
    await expect(l.item(0, 1)).toHaveText("Bananas");

    await expectList(page, ListName, [
      { name: "Fruits and vegetables", items: [{ text: "Apples", checked: true }, "Bananas", "Cherries"] },
      { name: "Bakery", items: ["Bread"] },
    ]);
  });

  await test.step("Changes are saved", async () => {
    await reopenList(page, ListName);
    await expectList(page, ListName, [
      { name: "Fruits and vegetables", items: [{ text: "Apples", checked: true }, "Bananas", "Cherries"] },
      { name: "Bakery", items: ["Bread"] },
    ]);
  });
});

test("Type a section name", async ({ page }) => {
  const l = locators(page);

  await createList(page);
  await l.listName.fill("Section name");
  await addSection(page, "Fruits");
  await expectList(page, "Section name", [{ name: "Fruits", items: [] }]);
});

test("Keyboard navigation with arrow keys", async ({ page }) => {
  const l = locators(page);

  await createList(page);
  await l.listName.fill("Navigation");
  await addSection(page, "A");
  await addItem(page, 0, "a1");
  await addSection(page, "B");
  await addItem(page, 1, "b1");
  await expectList(page, "Navigation", [
    { name: "A", items: ["a1"] },
    { name: "B", items: ["b1"] },
  ]);

  const order = [
    l.listName,
    l.sectionName(0),
    l.item(0, 0),
    l.item(0, 1), // new item placeholder
    l.sectionName(1),
    l.item(1, 0),
    l.item(1, 1), // new item placeholder
    l.newSection,
  ];

  await l.listName.focus();

  await test.step("Move down with ArrowDown", async () => {
    for (const target of order.slice(1)) {
      await page.keyboard.press("ArrowDown");
      await expect(target).toBeFocused();
    }
  });

  await test.step("Move up with ArrowUp", async () => {
    for (const target of order.slice(0, -1).reverse()) {
      await page.keyboard.press("ArrowUp");
      await expect(target).toBeFocused();
    }
  });
});

test("Delete a section", async ({ page }) => {
  const l = locators(page);

  await createList(page);
  await l.listName.fill("Sections");
  await addSection(page, "A");
  await addItem(page, 0, "a1");
  await addSection(page, "B");
  await addSection(page, "C");
  await addItem(page, 2, "c1");

  await test.step("Press Backspace in an empty section name", async () => {
    await l.sectionName(1).fill("");
    await page.keyboard.press("Backspace");

    await expectList(page, "Sections", [
      { name: "A", items: ["a1"] },
      { name: "C", items: ["c1"] },
    ]);
    await expect(l.item(0, 1)).toBeFocused();
  });

  await test.step("Changes are saved", async () => {
    await reopenList(page, "Sections");
    await expectList(page, "Sections", [
      { name: "A", items: ["a1"] },
      { name: "C", items: ["c1"] },
    ]);
  });
});

test("Keyboard navigation after deleting a section", async ({ page }) => {
  const l = locators(page);

  await createList(page);
  await l.listName.fill("Sections");
  await addSection(page, "A");
  await addItem(page, 0, "a1");
  await addSection(page, "B");
  await addSection(page, "C");
  await addItem(page, 2, "c1");

  await l.sectionName(1).fill("");
  await page.keyboard.press("Backspace");
  await expect(l.item(0, 1)).toBeFocused();

  const order = [l.sectionName(1), l.item(1, 0), l.item(1, 1), l.newSection];
  for (const target of order) {
    await page.keyboard.press("ArrowDown");
    await expect(target).toBeFocused();
  }
});

test("Press Enter in the list name and in the new section placeholder", async ({ page }) => {
  const l = locators(page);

  await createList(page);
  await l.listName.fill("Enter");

  await test.step("In the list name of a list without sections", async () => {
    await l.listName.press("Enter");
    await expect(l.newSection).toBeFocused();
    await expectList(page, "Enter", []);
  });

  await test.step("In the new section placeholder", async () => {
    await page.keyboard.press("Enter");
    await expectList(page, "Enter", [{ name: "", items: [] }]);
    await expect(l.item(0, 0)).toBeFocused();

    await addItem(page, 0, "a1");
    await expectList(page, "Enter", [{ name: "", items: ["a1"] }]);
  });

  await test.step("In the list name of a list with sections", async () => {
    await l.listName.press("Enter");
    await expect(l.sectionName(0)).toBeFocused();
    await expectList(page, "Enter", [{ name: "", items: ["a1"] }]);
  });

  await test.step("Changes are saved", async () => {
    await reopenList(page, "Enter");
    await expectList(page, "Enter", [{ name: "", items: ["a1"] }]);
  });
});
