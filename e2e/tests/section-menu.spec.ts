import { expect, test } from "fixtures/test";
import { expectList, fillList, locators, reopenList, type ExpectedSection } from "fixtures/list";

const Fruits = { name: "Fruits", items: ["Apples", "Pears"] };
const Bakery = { name: "Bakery", items: ["Bread"] };

test("Select a section", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Select", [Fruits, Bakery]);

  await l.sectionMenu(0).click();
  await l.menuItem("Select").click();

  await expect(l.banner).toContainText("1 section selected");
  await expect(l.selectedRows).toHaveCount(3);
  for (const row of [l.titleRow(0), l.itemRow(0, 0), l.itemRow(0, 1)]) {
    await expect(row).toHaveAttribute("data-selected", "true");
  }
  await expect(l.sectionMenu(0)).toBeHidden();
});

test("Sort a section by name", async ({ page }) => {
  const l = locators(page);
  const unsorted = ["banana", "Item 10", "Apple", "Éclair", "item 2", "cherry"];
  await fillList(page, "Sort", [{ name: "Shopping", items: unsorted }, Bakery]);
  await l.checkbox(0, 2).check();

  const expected: ExpectedSection[] = [
    {
      name: "Shopping",
      items: ["Apple", "banana", "cherry", "Éclair", "item 2", "Item 10"].map((text) => ({
        text,
        checked: text === "Apple",
      })),
    },
    Bakery,
  ];

  await test.step("Ignores case and accents, and sorts numbers by value", async () => {
    await l.sectionMenu(0).click();
    await l.menuItem("Sort by name").click();
    await expectList(page, "Sort", expected);
  });

  await test.step("Keyboard navigation follows the new order", async () => {
    await l.item(0, 0).click();
    await page.keyboard.press("ArrowDown");
    await expect(l.item(0, 1)).toBeFocused();
  });

  await test.step("Edits after the sort change the right item", async () => {
    await page.keyboard.press("End");
    await page.keyboard.type("s");
    await l.checkbox(0, 4).check();
    expected[0].items[1] = "bananas";
    expected[0].items[4] = { text: "item 2", checked: true };
    await expectList(page, "Sort", expected);
  });

  await test.step("The order is saved", async () => {
    await reopenList(page, "Sort");
    await expectList(page, "Sort", expected);
  });
});

test("Delete a section", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Delete", [Fruits, Bakery]);

  await test.step("Dismissing the prompt keeps the section", async () => {
    page.once("dialog", (dialog) => dialog.dismiss());
    await l.sectionMenu(0).click();
    await l.menuItem("Delete").click();
    await expectList(page, "Delete", [Fruits, Bakery]);
  });

  await test.step("Accepting the prompt deletes the section", async () => {
    let message = "";
    page.once("dialog", (dialog) => {
      message = dialog.message();
      return dialog.accept();
    });
    await l.sectionMenu(0).click();
    await l.menuItem("Delete").click();
    await expectList(page, "Delete", [Bakery]);
    expect(message).toBe('Delete the section "Fruits" and its 2 items?');
  });

  await test.step("The other sections can still be edited", async () => {
    await l.item(0, 0).click();
    await page.keyboard.press("End");
    await page.keyboard.type("s");
    await expectList(page, "Delete", [{ name: "Bakery", items: ["Breads"] }]);
  });

  await test.step("The deletion is saved", async () => {
    await reopenList(page, "Delete");
    await expectList(page, "Delete", [{ name: "Bakery", items: ["Breads"] }]);
  });
});
