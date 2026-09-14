import { db, readData, today } from "@/db";
import { clearRecovery } from "./backup";
import type {
  Account,
  Data,
  Goal,
  Investment,
  Settings,
  Transaction,
} from "@/types";
import {
  accountBalance,
  calculateGoalProgress,
  calculateNetWorth,
  sum,
  validateAllocations,
} from "@/finance";
export const uid = () => crypto.randomUUID();
async function snapshot(d: Data) {
  const worth = calculateNetWorth(d);
  await db.snapshots.put({
    id: today(),
    date: today(),
    ...worth,
    goalValues: Object.fromEntries(
      d.goals.map((g) => [
        g.id,
        calculateGoalProgress(g, d.allocations, d.investments).amount,
      ]),
    ),
  });
  for (const g of d.goals)
    await db.goals.update(g.id, {
      currentAllocatedAmount: calculateGoalProgress(
        g,
        d.allocations,
        d.investments,
      ).amount,
    });
}
export async function mutate(fn: (d: Data) => Promise<void>) {
  await db.transaction("rw", db.tables, async () => {
    await fn(await readData());
    const d = await readData();
    validateAllocations(d, d.allocations);
    await snapshot(d);
  });
}
export async function saveTransaction(
  t: Omit<Transaction, "id" | "createdAt">,
) {
  await mutate(async (d) => {
    if (!Number.isSafeInteger(t.amount) || t.amount <= 0)
      throw new Error("L’importo deve essere maggiore di zero.");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
      t.date > today() ||
      Number.isNaN(Date.parse(t.date)) ||
      new Date(t.date).toISOString().slice(0, 10) !== t.date
    )
      throw new Error("Usa una data valida non futura.");
    const a = d.accounts.find(
      (a) => a.id === t.accountId && !a.archived && a.type !== "investment",
    );
    if (!a) throw new Error("Seleziona un conto liquido.");
    if (t.type === "expense" || t.type === "income") {
      if (
        !d.categories.some(
          (c) => c.id === t.categoryId && !c.archived && c.type === t.type,
        )
      )
        throw new Error("Seleziona una categoria.");
    }
    if (
      t.type === "transfer" &&
      (!d.accounts.some(
        (a) =>
          a.id === t.transferAccountId &&
          !a.archived &&
          a.type !== "investment",
      ) ||
        t.transferAccountId === t.accountId)
    )
      throw new Error("Seleziona due conti liquidi diversi.");
    if (t.type === "investment" || t.type === "withdrawal") {
      const i = d.investments.find((i) => i.id === t.investmentId);
      if (!i) throw new Error("Seleziona un fondo.");
      if (t.type === "withdrawal" && t.amount > i.currentValue)
        throw new Error("Il disinvestimento supera il valore corrente.");
      const sign = t.type === "investment" ? 1 : -1;
      const capital =
        i.investedCapital === undefined
          ? undefined
          : t.type === "investment"
            ? sum([i.investedCapital, t.amount])
            : Number(
                (BigInt(i.investedCapital) *
                  BigInt(i.currentValue - t.amount)) /
                  BigInt(i.currentValue),
              );
      await db.investments.update(i.id, {
        currentValue: sum([i.currentValue, sign * t.amount]),
        investedCapital: capital,
      });
      await db.investmentTransactions.add({
        id: uid(),
        investmentId: i.id,
        type: sign === 1 ? "contribution" : "withdrawal",
        amount: t.amount,
        date: t.date,
      });
    }
    const tx = { ...t, id: uid(), createdAt: new Date().toISOString() };
    const next = [...d.transactions, tx];
    if (accountBalance(a, next, d.investments) < 0)
      throw new Error("Saldo insufficiente.");
    // Ordinary expenses consume the current-spending envelope first; protected goals remain untouched.
    if (t.type === "expense") {
      let remaining = t.amount;
      for (const x of d.allocations.filter(
        (x) => x.accountId === a.id && x.pillar === "liquidity",
      )) {
        const used = Math.min(remaining, x.amount);
        await db.allocations.update(x.id, {
          amount: x.amount - used,
          updatedAt: new Date().toISOString(),
        });
        remaining -= used;
      }
    }
    await db.transactions.add(tx);
  });
}
export async function saveAllocation(
  accountId: string,
  values: Record<string, number>,
) {
  await mutate(async (d) => {
    if (
      !d.accounts.some(
        (a) => a.id === accountId && !a.archived && a.type !== "investment",
      )
    )
      throw new Error("Seleziona un conto disponibile.");
    for (const [key, amount] of Object.entries(values)) {
      if (!Number.isSafeInteger(amount) || amount < 0)
        throw new Error("Allocazione non valida.");
      if (!amount) continue;
      const goal = d.goals.find((g) => g.id === key && g.status === "active");
      if (key !== "liquidity" && key !== "emergency" && !goal)
        throw new Error("Obiettivo non disponibile.");
      const now = new Date().toISOString();
      await db.allocations.add({
        id: uid(),
        accountId,
        goalId: goal?.id,
        pillar:
          key === "liquidity"
            ? "liquidity"
            : key === "emergency"
              ? "emergency"
              : goal!.pillar,
        amount,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}
export async function saveAccount(
  a: Omit<Account, "id" | "createdAt" | "archived">,
) {
  if (
    !a.name.trim() ||
    a.initialBalance < 0 ||
    !Number.isSafeInteger(a.initialBalance)
  )
    throw new Error("Dati conto non validi.");
  if (a.type === "investment" && a.initialBalance !== 0)
    throw new Error("Aggiungi il saldo tramite i singoli investimenti.");
  await mutate(async () => {
    await db.accounts.add({
      ...a,
      id: uid(),
      createdAt: new Date().toISOString(),
      archived: false,
    });
  });
}
export async function archiveAccount(id: string) {
  await mutate(async (d) => {
    const a = d.accounts.find((a) => a.id === id);
    if (!a) return;
    if (
      accountBalance(a, d.transactions, d.investments) !== 0 ||
      d.allocations.some((x) => x.accountId === id && x.amount > 0)
    )
      throw new Error(
        "Porta prima a zero saldo e allocazioni. La cronologia sarà conservata.",
      );
    await db.accounts.update(id, { archived: true });
  });
}
export async function saveGoal(g: Goal) {
  if (!g.name.trim() || (g.targetAmount !== undefined && g.targetAmount <= 0))
    throw new Error("Obiettivo non valido.");
  await mutate(async () => {
    await db.goals.put(g);
  });
}
export async function saveInvestment(i: Investment) {
  if (
    !i.name.trim() ||
    [i.currentValue, i.monthlyContribution ?? 0, i.investedCapital ?? 0].some(
      (n) => n < 0 || !Number.isSafeInteger(n),
    )
  )
    throw new Error("Investimento non valido.");
  await mutate(async (d) => {
    if (
      !d.accounts.some(
        (a) => a.id === i.accountId && a.type === "investment" && !a.archived,
      )
    )
      throw new Error("Seleziona un conto investimenti.");
    if (
      i.goalId &&
      !d.goals.some((g) => g.id === i.goalId && g.pillar === "longterm")
    )
      throw new Error("Obiettivo lungo termine non valido.");
    await db.investments.put(i);
    await db.investmentTransactions.add({
      id: uid(),
      investmentId: i.id,
      type: "value_update",
      amount: i.currentValue,
      date: today(),
      notes: "Valorizzazione manuale",
    });
  });
}
export async function saveSettings(s: Settings) {
  if (
    s.firstDayOfMonth < 1 ||
    s.firstDayOfMonth > 28 ||
    !Number.isInteger(s.firstDayOfMonth) ||
    s.emergencyFundTarget <= 0 ||
    (Object.keys(s.weights).length > 0 &&
      sum(Object.values(s.weights)) !== 100) ||
    Object.values(s.weights).some((v) => v < 0 || !Number.isInteger(v))
  )
    throw new Error("Controlla i parametri. I pesi devono sommare 100%.");
  await db.settings.put(s);
}
export async function resetData() {
  await clearRecovery();
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
    await db.settings.put({
      id: "main",
      monthlyExpenseEstimate: 50000,
      emergencyFundTarget: 300000,
      currency: "EUR",
      firstDayOfMonth: 1,
      weights: {},
      theme: "light",
    });
  });
}
