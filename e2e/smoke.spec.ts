import { expect, test } from "@playwright/test";

const KNEE_MRI_NYC =
  "/results?q=knee%20mri&codes=73721&codeType=cpt&lat=40.7484&lng=-73.9967&loc=New%20York%2C%20NY";

test("homepage search suggests procedures and places", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /ClearCost/ }).first()
  ).toBeVisible();

  await page.getByRole("combobox", { name: "What do you need?" }).fill("knee");
  await expect(page.getByRole("option", { name: "Knee MRI" })).toBeVisible();
  await page.keyboard.press("Escape");

  const location = page.getByRole("combobox", { name: "Location" });
  await location.fill("");
  await location.pressSequentially("Brookl");
  await expect(
    page.getByRole("option", { name: "Brooklyn, NY" })
  ).toBeVisible();
});

test("results show real prices with fine print", async ({ page }) => {
  await page.goto(KNEE_MRI_NYC);
  const answer = page.getByRole("region", { name: "Price answer" });
  await expect(answer).toBeVisible();
  await expect(answer).toContainText("$");
  await expect(page.getByText(/places? nearby/)).toBeVisible();
  await expect(page.getByText(/Good Faith Estimate/).first()).toBeVisible();
});

test("guided search asks a first question", async ({ page }) => {
  await page.goto("/guided-search?q=knee%20mri&lat=40.7484&lng=-73.9967");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 30_000,
  });
});

test("emergency wording shows the 911 notice", async ({ page }) => {
  await page.goto("/guided-search?q=chest%20pain&lat=40.7484&lng=-73.9967");
  await expect(page.getByRole("alert").first()).toContainText("call 911");
});

test("legal pages, robots and sitemap load", async ({ page, request }) => {
  for (const path of ["/legal/terms", "/legal/privacy", "/legal/disclaimers"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    expect((await request.get(path)).status()).toBe(200);
  }
});
