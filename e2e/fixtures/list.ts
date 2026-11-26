import { expect, type Locator, type Page } from "fixtures/test";

export type ExpectedItem = string | { text: string; checked: boolean };
export type ExpectedSection = { name: string; items: ExpectedItem[] };

export const locators = (page: Page) => {
  const sections = page.locator("section");
  const section = (s: number) => sections.nth(s);
  const items = (s: number) => section(s).locator("[contenteditable]");

  return {
    listName: page.getByRole("textbox", { name: "List name" }),
    sections,
    sectionName: (s: number) => section(s).getByRole("heading", { level: 2 }),
    newSection: page.getByPlaceholder("New section…"),
    items,
    item: (s: number, i: number) => items(s).nth(i),
    checkboxes: (s: number) => section(s).getByRole("checkbox"),
    checkbox: (s: number, i: number) => section(s).getByRole("listitem").nth(i).getByRole("checkbox"),
    itemRow: (s: number, i: number) => section(s).getByRole("listitem").nth(i),
    titleRow: (s: number) => section(s).locator("div[data-section]"),
    selectedRows: page.locator("[data-selected]"),
    banner: page.getByRole("toolbar", { name: "Selection" }),
  };
};

// Typing in a placeholder (new section or new item) creates a new element, and
// focus moves to that element on the next tick. Keystrokes sent before that
// land in the placeholder again and each create another element, so wait for
// the focus to move after the first character.
export async function typeInPlaceholder(page: Page, placeholder: Locator, all: Locator, text: string) {
  const idx = (await all.count()) - 1;
  await placeholder.click();
  await page.keyboard.type(text[0]);
  await expect(all).toHaveCount(idx + 2);
  await expect(all.nth(idx)).toBeFocused();
  await page.keyboard.type(text.slice(1));
}

export async function addSection(page: Page, name: string) {
  const l = locators(page);
  await typeInPlaceholder(page, l.newSection, l.sections.getByRole("heading", { level: 2 }), name);
}

export async function addItem(page: Page, sectionIdx: number, text: string) {
  const l = locators(page);
  await typeInPlaceholder(page, l.items(sectionIdx).last(), l.items(sectionIdx), text);
}

export async function createList(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New list…" }).click();
  await page.waitForTimeout(100); // Somehow the editor needs some time to wire things up
}

// Leaves the editor (which saves the pending changes), reloads the page and
// opens the list again.
export async function reopenList(page: Page, name: string) {
  await page.getByRole("link", { name: "Back to lists" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  // Changes are saved asynchronously when leaving the editor, and the lists
  // page shows the new name only once the save is done.
  await expect(page.getByRole("link", { name })).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name }).click();
}

// Checks the content of the editor, including the "new item" placeholder at
// the end of each section and the "new section" placeholder at the end of the
// list.
export async function expectList(page: Page, name: string, sections: ExpectedSection[]) {
  const l = locators(page);

  await expect(l.listName).toHaveValue(name);
  await expect(l.sections).toHaveCount(sections.length + 1);

  for (const [s, section] of sections.entries()) {
    await expect(l.sectionName(s)).toHaveValue(section.name);
    await expect(l.items(s)).toHaveCount(section.items.length + 1);
    await expect(l.checkboxes(s)).toHaveCount(section.items.length);

    for (const [i, item] of section.items.entries()) {
      const { text, checked } = typeof item === "string" ? { text: item, checked: false } : item;
      await expect(l.item(s, i)).toHaveText(text);
      await expect(l.checkbox(s, i)).toBeChecked({ checked });
    }

    await expect(l.item(s, section.items.length)).toHaveText("");
  }

  await expect(l.sectionName(sections.length)).toHaveValue("");
  await expect(l.sectionName(sections.length)).toHaveAttribute("placeholder", "New section…");
}

export async function fillList(page: Page, name: string, sections: { name: string; items: string[] }[]) {
  const l = locators(page);

  await createList(page);
  await l.listName.fill(name);

  for (const [s, section] of sections.entries()) {
    await addSection(page, section.name);
    for (const item of section.items) await addItem(page, s, item);
  }

  await expectList(page, name, sections);
}
