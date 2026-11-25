import { expect, test } from "fixtures/test";

// Browser back/forward navigations go through a different code path than
// in-app links (see ui/src/view-transition.ts).
test("Browser back and forward", async ({ page }) => {
  const TestListName = "Navigation list";
  const listName = page.getByRole("textbox", { name: "List name" });

  await page.goto("/");
  await page.getByRole("button", { name: "New list…" }).click();
  await page.waitForTimeout(100); // Somehow the editor needs some time to wire things up
  await listName.fill(TestListName);

  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("link", { name: TestListName })).toBeVisible();

  await page.goForward();
  await expect(listName).toHaveValue(TestListName);
});

// When the lists page opened the list, the back button goes back in history.
// It must not add a new history entry.
test("Back button after opening a list from the lists page", async ({ page }) => {
  const TestListName = "Back button list";
  const listName = page.getByRole("textbox", { name: "List name" });
  const backButton = page.getByRole("link", { name: "Back to lists" });
  const historyLength = () => page.evaluate(() => window.history.length);

  await page.goto("/");

  await test.step("From the new list button", async () => {
    await page.getByRole("button", { name: "New list…" }).click();
    await page.waitForTimeout(100); // Somehow the editor needs some time to wire things up
    await listName.fill(TestListName);
    const listUrl = page.url();
    const length = await historyLength();

    await backButton.click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    expect(await historyLength()).toBe(length);

    // The list is still the next history entry.
    await page.goForward();
    await expect(page).toHaveURL(listUrl);
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/");
  });

  await test.step("From the list link", async () => {
    await page.getByRole("link", { name: TestListName }).click();
    await expect(listName).toHaveValue(TestListName);
    const listUrl = page.url();
    const length = await historyLength();

    await backButton.click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    expect(await historyLength()).toBe(length);

    await page.goForward();
    await expect(page).toHaveURL(listUrl);
  });
});

// When the app was opened directly on a list, there is no lists page to go
// back to. The back button replaces the list page with the lists page.
test("Back button after opening a list directly", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New list…" }).click();
  await expect(page).toHaveURL((url) => url.pathname !== "/");

  await page.goto(page.url());
  const length = await page.evaluate(() => window.history.length);

  await page.getByRole("link", { name: "Back to lists" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  expect(await page.evaluate(() => window.history.length)).toBe(length);
});
