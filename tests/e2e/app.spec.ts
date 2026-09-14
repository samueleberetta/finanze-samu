import { test, expect } from "@playwright/test";
test("dashboard, movimento, allocazione confermata e persistenza", async ({
  page,
}) => {
  await page.goto("/dashboard/");
  await expect(
    page.getByText("4.721,73", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nuovo movimento" }).click();
  await page.getByLabel("Tipo di movimento").selectOption("income");
  await page.getByLabel("Importo (€)", { exact: true }).fill("1500");
  await page.getByLabel("Descrizione").fill("Stipendio di prova");
  await page.getByRole("button", { name: "Registra movimento" }).click();
  await expect(
    page.getByText("6.221,73", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Allocazioni", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Suggerisci allocazione" }).click();
  await expect(page.getByLabel("Spese correnti (€)")).toHaveValue("500.00");
  await expect(page.getByLabel("Fondo emergenza (€)")).toHaveValue("3000.00");
  await page.getByRole("button", { name: "Conferma allocazione" }).click();
  await expect(
    page.getByText("Allocazione confermata.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Allocazioni attuali", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("3.000,00", { exact: false }).first(),
  ).toBeVisible();
});
test("mobile, tema e tutte le pagine offline", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/");
  await expect(
    page.getByRole("heading", { name: "Tutto sotto controllo." }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.screenshot({ path: "/tmp/finanze-mobile.png", fullPage: true });
  await context.setOffline(true);
  await page.goto("/settings/");
  await expect(
    page.getByRole("heading", { name: "Impostazioni", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Tema", exact: true })
    .selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const route of [
    "transactions",
    "accounts",
    "goals",
    "investments",
    "allocation",
    "analytics",
    "dashboard",
  ]) {
    await page.goto(`/${route}/`);
    await expect(
      page.getByRole("button", { name: "Nuovo movimento" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Nuovo movimento" }).click();
  await page.getByLabel("Importo (€)", { exact: true }).fill("12.50");
  await page.getByRole("button", { name: "Registra movimento" }).click();
  await expect(page.locator(".wealth-value")).toContainText("4.709,23");
  await page.reload();
  await expect(page.locator(".wealth-value")).toContainText("4.709,23");
  await page.screenshot({
    path: "/tmp/finanze-mobile-dark.png",
    fullPage: true,
  });
});
test("backup JSON importato con recupero e reset protetto", async ({
  page,
}) => {
  await page.goto("/settings/");
  await expect(
    page.getByRole("heading", { name: "Backup e ripristino" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Esporta backup JSON completo" })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Backup non scaricato");
  await page.locator("input[type=file]").setInputFiles(path);
  await expect(
    page.getByRole("heading", { name: "Conferma ripristino" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Conferma importazione e sostituisci" })
    .click();
  await expect(
    page.getByText("Backup ripristinato.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Ripristina la copia precedente all’ultimo import",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Conferma ripristino" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chiudi", exact: true }).click();
  await page
    .getByRole("button", { name: "Elimina tutti i dati", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Elimina definitivamente", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Conferma eliminazione").fill("ELIMINA TUTTO");
  await page
    .getByRole("button", { name: "Elimina definitivamente", exact: true })
    .click();
  await expect(
    page.getByText("Dati eliminati.", { exact: false }),
  ).toBeVisible();
  await page.goto("/dashboard/");
  await expect(page.locator(".wealth-value")).toContainText("0,00");
});
test("desktop senza errori di pagina", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/dashboard/");
  await expect(page.locator(".wealth-value")).toContainText("4.721,73");
  await page.screenshot({ path: "/tmp/finanze-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("telefono piccolo: navigazione, form e movimenti senza scorrimento laterale", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/dashboard/");
  const nav = page.getByRole("navigation", { name: "Navigazione rapida" });
  await expect(nav).toBeVisible();
  await page.getByRole("button", { name: "Nuovo movimento" }).click();
  const amount = page.getByLabel("Importo (€)", { exact: true });
  await expect(amount).toHaveCSS("font-size", "16px");
  await amount.fill("15");
  await page.getByLabel("Descrizione").fill("Spesa dal telefono");
  await page.getByRole("button", { name: "Registra movimento" }).click();
  await nav.getByRole("link", { name: "Movimenti" }).click();
  await expect(
    page.getByText("Spesa dal telefono", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/finanze-mobile-movimenti.png",
    fullPage: true,
  });
  await nav.getByRole("button", { name: "Altro" }).click();
  await expect(page.locator("#main-menu")).toBeVisible();
  await page
    .locator("#main-menu")
    .getByRole("link", { name: "Impostazioni" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Impostazioni", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/finanze-mobile-settings.png",
    fullPage: true,
  });
});
