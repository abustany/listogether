import { expect, test, type Locator, type Page } from "fixtures/test";
import { expectList, fillList, locators, reopenList } from "fixtures/list";

const Fruits = { name: "Fruits", items: ["Apples", "Pears"] };
const Bakery = { name: "Bakery", items: ["Bread"] };
const Empty = { name: "Empty", items: [] };

async function expectSelected(page: Page, rows: Locator[]) {
  const l = locators(page);
  await expect(l.selectedRows).toHaveCount(rows.length);
  for (const row of rows) await expect(row).toHaveAttribute("data-selected", "true");
}

async function expectBanner(page: Page, text: string) {
  const l = locators(page);
  await expect(l.banner).toBeVisible();
  await expect(l.banner).toContainText(text);
}

async function startWithShiftArrow(page: Page, s: number, i: number) {
  const l = locators(page);
  await l.item(s, i).click();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(l.banner).toBeVisible();
}

async function mouseDrag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + 60, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 60, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
}

test("Enter the mode with Shift+Arrow", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Shift+Arrow", [Fruits, Bakery, Empty]);

  await test.step("In an item, selects it and the next item", async () => {
    await startWithShiftArrow(page, 0, 0);
    await expectSelected(page, [l.itemRow(0, 0), l.itemRow(0, 1)]);
    await expectBanner(page, "2 items selected");
  });

  await test.step("Shift+Arrow in the mode skips section titles", async () => {
    await page.keyboard.press("Shift+ArrowDown");
    await expectSelected(page, [l.itemRow(0, 0), l.itemRow(0, 1), l.itemRow(1, 0)]);
    await expectBanner(page, "3 items selected");
  });

  await test.step("Typing does nothing", async () => {
    await page.keyboard.type("xyz");
    await expectBanner(page, "3 items selected");
  });

  await test.step("Escape exits the mode", async () => {
    await page.keyboard.press("Escape");
    await expect(l.banner).toBeHidden();
    await expect(l.selectedRows).toHaveCount(0);
    await expectList(page, "Shift+Arrow", [Fruits, Bakery, Empty]);
  });

  await test.step("In the last item, selects only that item", async () => {
    await startWithShiftArrow(page, 1, 0);
    await expectSelected(page, [l.itemRow(1, 0)]);
    await expectBanner(page, "1 item selected");
    await page.keyboard.press("Escape");
  });

  await test.step("In a new item placeholder, selects the item above", async () => {
    await startWithShiftArrow(page, 0, 2);
    await expectSelected(page, [l.itemRow(0, 1)]);
    await page.keyboard.press("Escape");
  });

  await test.step("In the placeholder of an empty section, selects the item above", async () => {
    await l.item(2, 0).click();
    await page.keyboard.press("Shift+ArrowUp");
    await expectSelected(page, [l.itemRow(1, 0)]);
    await page.keyboard.press("Escape");
  });

  await test.step("In a section title, Shift+Arrow does not start the mode", async () => {
    await l.sectionName(0).click();
    await page.keyboard.press("Shift+ArrowDown");
    await expect(l.banner).toBeHidden();
  });
});

test("Change the selection with clicks", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Clicks", [Fruits, Bakery, Empty]);
  await startWithShiftArrow(page, 0, 0);

  await test.step("A click on an item toggles it, and the selection can have gaps", async () => {
    await l.item(0, 1).click();
    await expectSelected(page, [l.itemRow(0, 0)]);
    await l.item(1, 0).click();
    await expectSelected(page, [l.itemRow(0, 0), l.itemRow(1, 0)]);
    await expectBanner(page, "2 items selected");
  });

  await test.step("The checkboxes select the item and do not change", async () => {
    await l.checkbox(0, 1).click();
    await expectSelected(page, [l.itemRow(0, 0), l.itemRow(0, 1), l.itemRow(1, 0)]);
    await expect(l.checkbox(0, 1)).not.toBeChecked();
  });

  await test.step("Selecting all items of a section does not select its title", async () => {
    await expect(l.titleRow(0)).not.toHaveAttribute("data-selected");
    await expectBanner(page, "3 items selected");
  });

  await test.step("A click on a title selects it with its items", async () => {
    await l.sectionName(0).click();
    await expectSelected(page, [l.titleRow(0), l.itemRow(0, 0), l.itemRow(0, 1), l.itemRow(1, 0)]);
    await expectBanner(page, "1 section and 1 item selected");
  });

  await test.step("Unselecting an item unselects its title", async () => {
    await l.item(0, 0).click();
    await expectSelected(page, [l.itemRow(0, 1), l.itemRow(1, 0)]);
  });

  await test.step("A click on a selected title unselects it with its items", async () => {
    await l.sectionName(1).click();
    await expectSelected(page, [l.titleRow(1), l.itemRow(0, 1), l.itemRow(1, 0)]);
    await l.sectionName(1).click();
    await expectSelected(page, [l.itemRow(0, 1)]);
  });

  await test.step("A section with no items can be selected", async () => {
    await l.sectionName(2).click();
    await expectSelected(page, [l.titleRow(2), l.itemRow(0, 1)]);
    await expectBanner(page, "1 section and 1 item selected");
    await l.sectionName(0).click();
    await expectBanner(page, "2 sections selected");
  });

  await test.step("The mode stays on when nothing is selected", async () => {
    await l.sectionName(0).click();
    await l.sectionName(2).click();
    await expectSelected(page, []);
    await expectBanner(page, "Nothing selected");
    await expect(l.banner.getByRole("button", { name: "Delete" })).toBeDisabled();
    await expect(l.banner.getByRole("button", { name: "Check" })).toBeDisabled();
  });

  await test.step("Done exits the mode", async () => {
    await l.banner.getByRole("button", { name: "Done" }).click();
    await expect(l.banner).toBeHidden();
  });
});

test("Shift+click", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Shift+click", [Fruits, Bakery]);

  await test.step("Outside the mode, selects the items between the focused item and the clicked one", async () => {
    await l.item(0, 0).click();
    await l.item(1, 0).click({ modifiers: ["Shift"] });
    await expectSelected(page, [l.itemRow(0, 0), l.itemRow(0, 1), l.itemRow(1, 0)]);
    await expectBanner(page, "3 items selected");
  });

  await test.step("In the mode, adds the items between the last clicked item and the clicked one", async () => {
    await l.item(0, 0).click();
    await l.item(0, 1).click();
    await expectSelected(page, [l.itemRow(1, 0)]);
    await l.item(0, 0).click();
    await l.item(1, 0).click({ modifiers: ["Shift"] });
    await expectSelected(page, [l.itemRow(0, 0), l.itemRow(0, 1), l.itemRow(1, 0)]);
  });
});

test("Mouse drag", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Drag", [Fruits, Bakery]);

  await test.step("A drag from one item to another starts the mode", async () => {
    await mouseDrag(page, l.item(0, 0), l.item(1, 0));
    await expectSelected(page, [l.itemRow(0, 0), l.itemRow(0, 1), l.titleRow(1), l.itemRow(1, 0)]);
    await expectBanner(page, "1 section and 2 items selected");
  });

  await test.step("A drag in the mode only adds to the selection", async () => {
    await l.item(0, 1).click();
    await l.sectionName(1).click();
    await expectSelected(page, [l.itemRow(0, 0)]);
    await mouseDrag(page, l.item(0, 0), l.item(0, 1));
    await expectSelected(page, [l.itemRow(0, 0), l.itemRow(0, 1)]);
  });
});

test("Check and uncheck the selection", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Check", [Fruits, Bakery]);
  await l.checkbox(0, 0).check();

  await startWithShiftArrow(page, 0, 0);
  const checkButton = l.banner.getByRole("button", { name: "Check" });
  const uncheckButton = l.banner.getByRole("button", { name: "Uncheck" });

  await checkButton.click();
  await expect(l.checkbox(0, 0)).toBeChecked();
  await expect(l.checkbox(0, 1)).toBeChecked();
  await expect(l.checkbox(1, 0)).not.toBeChecked();
  await expectSelected(page, [l.itemRow(0, 0), l.itemRow(0, 1)]);
  await expect(uncheckButton).toBeVisible();

  await uncheckButton.click();
  await expect(l.checkbox(0, 0)).not.toBeChecked();
  await expect(l.checkbox(0, 1)).not.toBeChecked();
  await expect(checkButton).toBeVisible();

  await checkButton.click();
  await page.keyboard.press("Escape");
  await reopenList(page, "Check");
  await expectList(page, "Check", [
    {
      name: "Fruits",
      items: [
        { text: "Apples", checked: true },
        { text: "Pears", checked: true },
      ],
    },
    Bakery,
  ]);
});

test("Delete the selection", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Delete", [Fruits, Bakery, { name: "Dairy", items: ["Milk"] }]);

  await test.step("With the Delete button", async () => {
    // Shift+ArrowDown also selects Bread, the next item.
    await startWithShiftArrow(page, 0, 1);
    await l.sectionName(1).click();
    await expectBanner(page, "1 section and 1 item selected");
    await l.banner.getByRole("button", { name: "Delete" }).click();

    await expect(l.banner).toBeHidden();
    await expectList(page, "Delete", [
      { name: "Fruits", items: ["Apples"] },
      { name: "Dairy", items: ["Milk"] },
    ]);
  });

  await test.step("The caret goes to the end of the element before the first deleted one", async () => {
    await expect(l.item(0, 0)).toBeFocused();
    await page.keyboard.type("!");
    await expect(l.item(0, 0)).toHaveText("Apples!");
    await page.keyboard.press("Backspace");
  });

  await test.step("With Backspace, a section whose title is not selected is kept", async () => {
    await startWithShiftArrow(page, 1, 0);
    await page.keyboard.press("Backspace");

    await expect(l.banner).toBeHidden();
    await expectList(page, "Delete", [
      { name: "Fruits", items: ["Apples"] },
      { name: "Dairy", items: [] },
    ]);
    await expect(l.sectionName(1)).toBeFocused();
  });

  await test.step("The keyboard navigation still works", async () => {
    await page.keyboard.press("ArrowUp");
    await expect(l.item(0, 1)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(l.item(1, 0)).toBeFocused();
  });

  await test.step("Changes are saved", async () => {
    await reopenList(page, "Delete");
    await expectList(page, "Delete", [
      { name: "Fruits", items: ["Apples"] },
      { name: "Dairy", items: [] },
    ]);
  });
});

test("Leaving the list exits the mode without deleting", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Leave", [Fruits]);

  await startWithShiftArrow(page, 0, 0);
  await reopenList(page, "Leave");
  await expect(l.banner).toBeHidden();
  await expectList(page, "Leave", [Fruits]);
});
