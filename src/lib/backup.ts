import { z } from "zod";
import Dexie from "dexie";
import type { Data } from "@/types";
import { db, readData, tableNames } from "@/db";
import { validateAllocations, calculateNetWorth } from "@/finance";
const id = z.string().min(1).max(200),
  text = z.string().max(2000),
  amount = z.number().int().nonnegative().safe();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
  );
const timestamp = z.string().datetime(),
  pillar = z.enum(["liquidity", "emergency", "planned", "longterm"]);
const schema = z
  .object({
    version: z.literal(1),
    exportedAt: timestamp,
    data: z
      .object({
        accounts: z.array(
          z
            .object({
              id,
              name: text,
              type: z.enum(["checking", "deposit", "investment"]),
              initialBalance: amount,
              createdAt: timestamp,
              archived: z.boolean(),
            })
            .strict(),
        ),
        transactions: z.array(
          z
            .object({
              id,
              accountId: id,
              type: z.enum([
                "income",
                "expense",
                "transfer",
                "investment",
                "withdrawal",
              ]),
              amount: amount.positive(),
              date,
              categoryId: z.string(),
              description: text,
              transferAccountId: id.optional(),
              investmentId: id.optional(),
              createdAt: timestamp,
            })
            .strict(),
        ),
        categories: z.array(
          z
            .object({
              id,
              name: text,
              type: z.enum(["income", "expense"]),
              icon: text.optional(),
              archived: z.boolean(),
            })
            .strict(),
        ),
        goals: z.array(
          z
            .object({
              id,
              name: text,
              targetAmount: amount.positive().optional(),
              currentAllocatedAmount: amount,
              priority: z.number().int().min(1).max(100),
              pillar,
              deadline: date.optional(),
              targetYear: z.number().int().min(2000).max(2200).optional(),
              description: text.optional(),
              status: z.enum(["active", "completed", "paused"]),
              createdAt: timestamp,
            })
            .strict(),
        ),
        allocations: z.array(
          z
            .object({
              id,
              accountId: id,
              goalId: id.optional(),
              pillar,
              amount,
              createdAt: timestamp,
              updatedAt: timestamp,
            })
            .strict(),
        ),
        investments: z.array(
          z
            .object({
              id,
              name: text,
              accountId: id,
              currentValue: amount,
              investedCapital: amount.optional(),
              monthlyContribution: amount.optional(),
              goalId: id.optional(),
              pillar,
              createdAt: timestamp,
            })
            .strict(),
        ),
        investmentTransactions: z.array(
          z
            .object({
              id,
              investmentId: id,
              type: z.enum(["contribution", "withdrawal", "value_update"]),
              amount,
              date,
              notes: text.optional(),
            })
            .strict(),
        ),
        recurringTransactions: z.array(
          z
            .object({
              id,
              accountId: id,
              type: z.enum(["income", "expense"]),
              amount: amount.positive(),
              categoryId: id,
              description: text,
              nextDate: date,
              enabled: z.boolean(),
            })
            .strict(),
        ),
        settings: z
          .array(
            z
              .object({
                id: z.literal("main"),
                monthlyExpenseEstimate: amount,
                emergencyFundTarget: amount.positive(),
                currency: z.literal("EUR"),
                firstDayOfMonth: z.number().int().min(1).max(28),
                weights: z.record(z.number().int().min(0).max(100)),
                theme: z.enum(["light", "dark"]),
              })
              .strict(),
          )
          .length(1),
        snapshots: z.array(
          z
            .object({
              id,
              date,
              netWorth: z.number().int().safe(),
              liquidAssets: z.number().int().safe(),
              investments: amount,
              goalValues: z.record(amount),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();
export function validateBackup(value: unknown): Data {
  const d = schema.parse(value).data;
  for (const name of tableNames) {
    const rows = d[name];
    if (new Set(rows.map((x) => x.id)).size !== rows.length)
      throw new Error(`ID duplicati in ${name}.`);
  }
  const account = (id: string) => {
    const a = d.accounts.find((a) => a.id === id);
    if (!a) throw new Error("Riferimento a conto inesistente.");
    return a;
  };
  const goal = (id?: string) => {
    if (id && !d.goals.some((g) => g.id === id))
      throw new Error("Obiettivo inesistente.");
  };
  const investment = (id?: string) => {
    if (!id || !d.investments.some((i) => i.id === id))
      throw new Error("Investimento inesistente.");
  };
  for (const t of d.transactions) {
    if (account(t.accountId).type === "investment")
      throw new Error("Movimento su conto non liquido.");
    if (t.type === "transfer") {
      if (
        !t.transferAccountId ||
        t.accountId === t.transferAccountId ||
        account(t.transferAccountId).type === "investment"
      )
        throw new Error("Trasferimento non valido.");
    }
    if (t.type === "investment" || t.type === "withdrawal")
      investment(t.investmentId);
    if (t.type === "income" || t.type === "expense") {
      if (!d.categories.some((c) => c.id === t.categoryId && c.type === t.type))
        throw new Error("Categoria non valida.");
    }
  }
  for (const i of d.investments) {
    if (account(i.accountId).type !== "investment")
      throw new Error("Conto investimento non valido.");
    goal(i.goalId);
  }
  for (const a of d.allocations) {
    account(a.accountId);
    goal(a.goalId);
    if (a.goalId && d.goals.find((g) => g.id === a.goalId)?.pillar !== a.pillar)
      throw new Error("Pilastro non coerente.");
  }
  for (const t of d.investmentTransactions) investment(t.investmentId);
  for (const t of d.recurringTransactions) {
    account(t.accountId);
    if (!d.categories.some((c) => c.id === t.categoryId && c.type === t.type))
      throw new Error("Categoria ricorrenza non valida.");
  }
  validateAllocations(d, d.allocations);
  calculateNetWorth(d);
  return d;
}
export const envelope = (data: Data) => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  data,
});
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportBackup() {
  const d = await db.transaction("r", db.tables, readData);
  download(
    `finance-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(envelope(d), null, 2),
  );
}
const recoveryDB = new Dexie("finanze-samu-recovery");
recoveryDB.version(1).stores({ copies: "id" });
export async function readRecovery() {
  const row = await recoveryDB.table("copies").get("pre-import");
  if (!row) throw new Error("Nessuna copia precedente disponibile.");
  return validateBackup(row.backup);
}
export async function clearRecovery() {
  await recoveryDB.table("copies").clear();
}
export async function importBackup(data: Data) {
  const validated = validateBackup(envelope(data));
  const old = await db.transaction("r", db.tables, readData);
  await recoveryDB
    .table("copies")
    .put({ id: "pre-import", backup: envelope(old) });
  download(
    `finance-backup-${new Date().toISOString().slice(0, 10)}-pre-import.json`,
    JSON.stringify(envelope(old), null, 2),
  );
  await db.transaction("rw", db.tables, async () => {
    if (JSON.stringify(await readData()) !== JSON.stringify(old))
      throw new Error(
        "I dati sono cambiati durante il backup. Ripeti l’importazione.",
      );
    for (const name of tableNames) {
      await db.table(name).clear();
      await db.table(name).bulkPut(validated[name]);
    }
  });
}
export function exportCSV(d: Data) {
  const cell = (v: string) =>
    `"${v.replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const rows = [
    [
      "Data",
      "Tipo",
      "Conto",
      "Destinazione",
      "Categoria",
      "Descrizione",
      "Importo EUR",
    ],
    ...d.transactions.map((t) => [
      t.date,
      t.type,
      d.accounts.find((a) => a.id === t.accountId)?.name || "",
      d.accounts.find((a) => a.id === t.transferAccountId)?.name || "",
      d.categories.find((c) => c.id === t.categoryId)?.name || "",
      t.description,
      (t.amount / 100).toFixed(2),
    ]),
  ];
  download(
    "transactions.csv",
    "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
}
