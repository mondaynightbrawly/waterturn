import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
test("connected crop harvest, cattle feed, maintenance, financial reports and reload", async ({
  page,
}) => {
  await page.goto("/");
  const nav = async (name: string) => {
    await navigate(page, name);
  };
  const save = async () => {
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await expect(page.locator(".farm-entry")).toHaveCount(0);
  };
  await nav("Dashboard");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Load demo farm", exact: true })
    .click();
  await nav("Finances");
  for (const [name, kind] of [
    ["Fictional silage", "crop"],
    ["Fictional finishing", "cattle"],
  ]) {
    await page
      .getByRole("button", { name: "Add enterprise", exact: true })
      .click();
    await page.getByLabel("Enterprise name", { exact: true }).fill(name);
    await page
      .getByRole("combobox", { name: "Enterprise type", exact: true })
      .selectOption(kind);
    await save();
  }
  await nav("Inventory");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Item name", { exact: true })
    .fill("Fictional silage stock");
  await page
    .getByRole("combobox", { name: "Base quantity unit", exact: true })
    .selectOption("ton");
  await save();
  await nav("Crops");
  await page
    .getByRole("button", { name: "Plan crop season", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Field", exact: true })
    .selectOption({ label: "North 40" });
  await page
    .getByRole("combobox", { name: "Enterprise", exact: true })
    .selectOption({ label: "Fictional silage" });
  await page
    .getByRole("combobox", { name: "Crop", exact: true })
    .fill("Corn silage");
  await page.getByLabel("Planted acres", { exact: true }).fill("20");
  await save();
  await nav("Finances");
  await page
    .getByRole("button", { name: "Record expense", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Enterprise", exact: true })
    .selectOption({ label: "Fictional silage" });
  await page
    .getByLabel("Expense description", { exact: true })
    .fill("Fictional production cost");
  await page
    .getByLabel("Actual cost ($; do not repeat an existing expense)", {
      exact: true,
    })
    .fill("10000");
  await save();
  await nav("Crops");
  await page
    .getByRole("button", { name: "Record harvest", exact: true })
    .click();
  await page.getByLabel("Harvest quantity", { exact: true }).fill("200");
  await page
    .getByRole("combobox", { name: "Harvest unit", exact: true })
    .selectOption("ton");
  await page
    .getByLabel("Moisture percent (optional; blank = unknown)", { exact: true })
    .fill("65");
  await page
    .getByLabel("Production cost to capitalize ($; must already be recorded)", {
      exact: true,
    })
    .fill("10000");
  await page
    .getByLabel("Storage destination", { exact: true })
    .fill("Fictional pit");
  await save();
  await nav("Cattle");
  await page.getByRole("button", { name: "Add group", exact: true }).click();
  await page.getByLabel("Group name", { exact: true }).fill("Fictional steers");
  await page
    .getByRole("combobox", { name: "Enterprise", exact: true })
    .selectOption({ label: "Fictional finishing" });
  await page
    .getByRole("combobox", { name: "Management method", exact: true })
    .selectOption("headcount");
  await page
    .getByLabel("Headcount (headcount mode only)", { exact: true })
    .fill("40");
  await save();
  await page
    .getByRole("button", { name: "Record feeding", exact: true })
    .click();
  await page
    .getByLabel("As-fed quantity (item base unit)", { exact: true })
    .fill("10");
  await save();
  await expect(page.getByText(/3.5 ton dry matter/)).toBeVisible();
  await nav("Inventory");
  await expect(
    page.getByRole("heading", { name: "190 ton", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("$9,500.00", { exact: true })).toBeVisible();
  await nav("Equipment");
  await page
    .getByRole("button", { name: "Add equipment", exact: true })
    .click();
  await page
    .getByLabel("Asset name", { exact: true })
    .fill("Fictional tractor");
  await page.getByLabel("Engine hours", { exact: true }).fill("500");
  await save();
  await page
    .getByRole("button", { name: "Schedule maintenance", exact: true })
    .click();
  await page
    .getByLabel("Service or repair title", { exact: true })
    .fill("Fictional oil service");
  await page
    .getByLabel("Due at engine hours (0 = no meter trigger)", { exact: true })
    .fill("500");
  await save();
  await expect(page.getByText(/DUE NOW/)).toBeVisible();
  await page
    .getByRole("button", { name: "Complete service", exact: true })
    .click();
  await page
    .getByLabel("Diagnosis / work performed", { exact: true })
    .fill("Changed oil");
  await save();
  await nav("Reports");
  await expect(
    page.getByRole("cell", { name: "Fictional finishing", exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    "waterturn-enterprise.csv",
  );
  await page.reload();
  await nav("Inventory");
  await expect(
    page.getByRole("heading", { name: "190 ton", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/farmos-integrated-mobile.png",
    fullPage: true,
  });
});
