import { expect, test, type Locator, type Page } from "fixtures/test";
import { expectList, fillList, locators } from "fixtures/list";

const Fruits = { name: "Fruits", items: ["Apples", "Pears"] };
const Bakery = { name: "Bakery", items: ["Bread"] };

// Playwright has no long press or touch drag, so send the touch events
// through the Chrome DevTools Protocol.
async function touchscreen(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });

  const point = async (target: Locator, xOffset?: number) => {
    const box = (await target.boundingBox())!;
    return { x: box.x + (xOffset ?? box.width / 2), y: box.y + box.height / 2 };
  };

  return {
    // Does not lift the finger.
    async press(target: Locator, xOffset?: number) {
      const { x, y } = await point(target, xOffset);
      await send("touchStart", x, y);
      await page.waitForTimeout(700);
    },
    async moveTo(target: Locator, steps = 5) {
      const { x, y } = await point(target);
      for (let k = 1; k <= steps; k++) await send("touchMove", x, y - (steps - k) * 4);
    },
    async release() {
      await send("touchEnd");
    },
  };
}

test("Long press on a checkbox", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Long press", [Fruits, Bakery]);
  const touch = await touchscreen(page);

  await test.step("Starts the mode and selects the item, without checking it", async () => {
    await touch.press(l.checkbox(0, 0));
    await touch.release();

    await expect(l.banner).toContainText("1 item selected");
    await expect(l.itemRow(0, 0)).toHaveAttribute("data-selected", "true");
    await expect(l.checkbox(0, 0)).not.toBeChecked();
  });

  await test.step("A tap toggles an item", async () => {
    await l.item(1, 0).tap();
    await expect(l.banner).toContainText("2 items selected");
    await l.checkbox(1, 0).tap();
    await expect(l.banner).toContainText("1 item selected");
    await expect(l.checkbox(1, 0)).not.toBeChecked();
  });

  await test.step("After a delete, nothing has the focus", async () => {
    await l.banner.getByRole("button", { name: "Delete" }).tap();
    await expect(l.banner).toBeHidden();
    await expectList(page, "Long press", [{ name: "Fruits", items: ["Pears"] }, Bakery]);
    await expect(page.locator(":focus")).toHaveCount(0);
  });
});

test("Long press on the area left of the checkbox, then drag", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Drag", [Fruits, Bakery]);
  const touch = await touchscreen(page);

  await touch.press(l.itemRow(0, 0), 10);
  await touch.moveTo(l.checkbox(0, 1));
  await touch.moveTo(l.checkbox(1, 0));
  await touch.release();

  await expect(l.banner).toContainText("1 section and 2 items selected");
  await expect(l.selectedRows).toHaveCount(4);
  await expect(l.titleRow(1)).toHaveAttribute("data-selected", "true");
});

test("Long press on the area left of a section title", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Title", [Fruits, Bakery]);
  const touch = await touchscreen(page);

  await test.step("Starts the mode and selects the section", async () => {
    await touch.press(l.titleRow(0), 10);
    await touch.release();

    await expect(l.banner).toContainText("1 section selected");
    await expect(l.titleRow(0)).toHaveAttribute("data-selected", "true");
    await expect(l.selectedRows).toHaveCount(3);
  });

  await test.step("In the mode, adds the section and never unselects it", async () => {
    await touch.press(l.titleRow(1), 10);
    await touch.release();
    await expect(l.banner).toContainText("2 sections selected");

    await touch.press(l.titleRow(1), 10);
    await touch.release();
    await expect(l.banner).toContainText("2 sections selected");
  });
});

test("Long press on a section title text does not start the mode", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Title text", [Fruits]);
  const touch = await touchscreen(page);

  await touch.press(l.sectionName(0));
  await touch.release();
  await expect(l.banner).toBeHidden();
});

test("Long press on the item text does not start the mode", async ({ page }) => {
  const l = locators(page);
  await fillList(page, "Text", [Fruits]);
  const touch = await touchscreen(page);

  await touch.press(l.item(0, 0));
  await touch.release();
  await expect(l.banner).toBeHidden();
});
