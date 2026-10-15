import { test, expect } from "@playwright/test";
import { demo } from "../src/demo";
import { navigate } from "./navigation";
test("a physical IndexedDB v1 irrigation database upgrades with an exact original backup", async ({
  page,
}) => {
  const legacy = demo();
  await page.goto("/icon.svg");
  await page.evaluate(
    async (data) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("waterturn", 10);
        req.onupgradeneeded = () =>
          req.result.createObjectStore("state", { keyPath: "id" });
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction("state", "readwrite");
          tx.objectStore("state").put({ ...data, id: "farm" });
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    legacy,
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your operation, in view." }),
  ).toBeVisible();
  const saved = await page.evaluate(
    async () =>
      new Promise<{ version: number; data: unknown }>((resolve, reject) => {
        const req = indexedDB.open("waterturn");
        req.onsuccess = () => {
          const tx = req.result.transaction("backups"),
            get = tx.objectStore("backups").get("before-farmos-v2");
          get.onsuccess = () => {
            resolve({ version: req.result.version, data: get.result.data });
            req.result.close();
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
  expect(saved.version).toBe(30);
  expect(saved.data).toEqual(legacy);
  await navigate(page, "Dashboard");
  await expect(page.locator(".session")).toHaveCount(2);
});
test("optional FarmOS demo shows connected farm data and persists widget choices", async ({
  page,
}) => {
  await page.goto("/");
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Load fictional FarmOS demo", exact: true })
    .click();
  await expect(
    page.getByText("Demo check east headgate", { exact: true }),
  ).toBeVisible();
  await page.getByText("Customize home widgets", { exact: true }).click();
  for (const widget of ["equipment", "inventory", "cattle"]) {
    await page.getByRole("checkbox", { name: widget, exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: widget, exact: true }),
    ).toBeChecked();
  }
  await page.getByText("Customize home widgets", { exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/farmos-demo-dashboard-mobile.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "test-results/farmos-demo-dashboard-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByText("Inventory shortages", { exact: true }),
  ).toBeVisible();
  await navigate(page, "Inventory");
  await expect(
    page.getByRole("heading", { name: "199 ton", exact: true }),
  ).toBeVisible();
});
