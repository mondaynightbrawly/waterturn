import type { Page } from "@playwright/test";
export async function navigate(page: Page, name: string) {
  await page.getByRole("navigation").waitFor();
  const label=name==="Dashboard"?"Irrigation":name==="Farm Home"?"Home":name;
  const button = page.getByRole("button", { name:label, exact: true });
  if (!(await button.isVisible())) {
    const more = page.getByRole("button", { name: "More", exact: true });
    if (await more.isVisible()) await more.click();
  }
  await button.click();
}
