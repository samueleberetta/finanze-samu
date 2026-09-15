import { beforeEach, describe, expect, it } from "vitest";
import { db, readData, seed, today } from "@/db";
import {
  accountBalance,
  calculateAvailableToAllocate,
  calculateGoalProgress,
  calculateMonthlyCashflow,
  calculateNetWorth,
  cents,
  suggestAllocation,
  validateAllocations,
} from "@/finance";
import {
  mutate,
  saveAllocation,
  saveInvestment,
  saveTransaction,
} from "@/lib/actions";
import { envelope, validateBackup } from "@/lib/backup";
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  await seed();
});
describe("Contabilità in centesimi", () => {
  it("inizializza i saldi senza raddoppiare gli investimenti", async () => {
    const d = await readData();
    expect(calculateNetWorth(d)).toEqual({
      netWorth: 472173,
      liquidAssets: 277000,
      investments: 195173,
    });
    expect(calculateAvailableToAllocate(d)).toBe(277000);
    expect(d.accounts.find((a) => a.id === "bpm-pac")?.initialBalance).toBe(0);
    expect(d.accounts.find((a) => a.id === "contanti")?.initialBalance).toBe(0);
    expect(d.investments.every((i) => i.investedCapital === undefined)).toBe(
      true,
    );
  });
  it("aggiunge BPM PAC e Contanti anche a un archivio esistente", async () => {
    await db.accounts.bulkDelete(["bpm-pac", "contanti"]);
    await seed();
    const d = await readData();
    expect(d.accounts.some((a) => a.id === "bpm-pac")).toBe(true);
    expect(d.accounts.some((a) => a.id === "contanti")).toBe(true);
  });
  it("converte gli importi senza errori floating point", () => {
    expect(cents("0,29")).toBe(29);
    expect(cents("1951.73")).toBe(195173);
    for (const s of ["-2", "NaN", "1.001", "Infinity", "1e5", ""])
      expect(() => cents(s)).toThrow();
  });
  it("un trasferimento conserva il patrimonio e non conta come spesa", async () => {
    await saveTransaction({
      accountId: "bpm",
      transferAccountId: "revolut",
      type: "transfer",
      amount: 50000,
      date: today(),
      categoryId: "",
      description: "",
    });
    const d = await readData();
    expect(calculateNetWorth(d).netWorth).toBe(472173);
    expect(
      accountBalance(
        d.accounts.find((a) => a.id === "revolut")!,
        d.transactions,
        d.investments,
      ),
    ).toBe(70000);
    expect(calculateMonthlyCashflow(d.transactions, today()).expense).toBe(0);
  });
  it("rifiuta stesso conto, saldo insufficiente e date future", async () => {
    await expect(
      saveTransaction({
        accountId: "bpm",
        transferAccountId: "bpm",
        type: "transfer",
        amount: 1,
        date: today(),
        categoryId: "",
        description: "",
      }),
    ).rejects.toThrow();
    await expect(
      saveTransaction({
        accountId: "revolut",
        type: "expense",
        amount: 999999,
        date: today(),
        categoryId: "expense-0",
        description: "",
      }),
    ).rejects.toThrow();
    await expect(
      saveTransaction({
        accountId: "bpm",
        type: "income",
        amount: 100,
        date: "2200-01-01",
        categoryId: "income-0",
        description: "",
      }),
    ).rejects.toThrow();
  });
  it("le allocazioni non cambiano i saldi e rispettano ciascun conto", async () => {
    await saveAllocation("bpm", { emergency: 200000, liquidity: 50000 });
    let d = await readData();
    expect(calculateNetWorth(d).netWorth).toBe(472173);
    expect(calculateAvailableToAllocate(d)).toBe(27000);
    await expect(saveAllocation("bpm", { auto: 1 })).rejects.toThrow();
    d = await readData();
    expect(d.allocations).toHaveLength(2);
    expect(validateAllocations(d, d.allocations)).toBe(true);
  });
  it("consuma le spese correnti e protegge le allocazioni obiettivo", async () => {
    await saveAllocation("bpm", { emergency: 200000, liquidity: 50000 });
    await saveTransaction({
      accountId: "bpm",
      type: "expense",
      amount: 10000,
      date: today(),
      categoryId: "expense-0",
      description: "Spesa",
    });
    let d = await readData();
    expect(d.allocations.find((a) => a.pillar === "liquidity")?.amount).toBe(
      40000,
    );
    await expect(
      saveTransaction({
        accountId: "bpm",
        type: "expense",
        amount: 50000,
        date: today(),
        categoryId: "expense-0",
        description: "",
      }),
    ).rejects.toThrow();
    d = await readData();
    expect(d.transactions).toHaveLength(1);
    expect(d.allocations.find((a) => a.pillar === "emergency")?.amount).toBe(
      200000,
    );
  });
  it("investimento e disinvestimento conservano il patrimonio; valore manuale lo aggiorna", async () => {
    await saveTransaction({
      accountId: "bpm",
      type: "investment",
      investmentId: "america",
      amount: 5000,
      date: today(),
      categoryId: "",
      description: "",
    });
    let d = await readData();
    expect(calculateNetWorth(d).netWorth).toBe(472173);
    expect(d.investments.find((i) => i.id === "america")?.currentValue).toBe(
      71058,
    );
    await saveTransaction({
      accountId: "bpm",
      type: "withdrawal",
      investmentId: "america",
      amount: 5000,
      date: today(),
      categoryId: "",
      description: "",
    });
    d = await readData();
    expect(calculateNetWorth(d).netWorth).toBe(472173);
    await saveInvestment({
      ...d.investments.find((i) => i.id === "america")!,
      currentValue: 67058,
    });
    expect(calculateNetWorth(await readData()).netWorth).toBe(473173);
  });
  it("rollback atomico quando il versamento compromette allocazioni protette", async () => {
    await saveAllocation("bpm", { emergency: 250000 });
    await expect(
      saveTransaction({
        accountId: "bpm",
        type: "investment",
        investmentId: "america",
        amount: 100,
        date: today(),
        categoryId: "",
        description: "",
      }),
    ).rejects.toThrow();
    const d = await readData();
    expect(d.investmentTransactions).toHaveLength(0);
    expect(d.transactions).toHaveLength(0);
    expect(calculateNetWorth(d).investments).toBe(195173);
  });
  it("calcola il mese contabile e gestisce entrate zero", () => {
    expect(calculateMonthlyCashflow([], today()).savingsRate).toBeNull();
    const t = {
      id: "x",
      accountId: "bpm",
      type: "income" as const,
      amount: 10000,
      date: "2026-09-05",
      categoryId: "income-0",
      description: "",
      createdAt: new Date().toISOString(),
    };
    expect(calculateMonthlyCashflow([t], "2026-09-11", 10).income).toBe(0);
    expect(calculateMonthlyCashflow([t], "2026-08-15", 10).income).toBe(10000);
  });
  it("suggerisce prima spese ed emergenza, poi pesi modificabili senza scrivere", async () => {
    const d = await readData();
    const s = {
      ...d.settings[0],
      monthlyExpenseEstimate: 30000,
      emergencyFundTarget: 50000,
    };
    const proposal = suggestAllocation(150000, s, 0, [], d.goals, []);
    expect(proposal).toEqual({
      liquidity: 30000,
      emergency: 50000,
      auto: 35000,
      longterm: 17500,
      casa: 14000,
      giappone: 3500,
    });
    expect((await readData()).allocations).toHaveLength(0);
    expect(
      Object.values(
        suggestAllocation(
          7,
          { ...s, monthlyExpenseEstimate: 0, emergencyFundTarget: 1 },
          0,
          [],
          d.goals,
          [],
        ),
      ).reduce((a, b) => a + b, 0),
    ).toBe(7);
  });
  it("obiettivi sommano allocazioni e investimenti una sola volta", async () => {
    await saveAllocation("bpm", { longterm: 100 });
    const d = await readData();
    expect(
      calculateGoalProgress(
        d.goals.find((g) => g.id === "longterm")!,
        d.allocations,
        d.investments,
      ),
    ).toEqual({ amount: 195273, percent: null });
  });
  it("convalida backup completo e rifiuta schema, importi, riferimenti e duplicati", async () => {
    const d = await readData();
    expect(validateBackup(envelope(d))).toEqual(d);
    expect(() => validateBackup({ ...envelope(d), version: 2 })).toThrow();
    const bad = structuredClone(d);
    bad.accounts[0].initialBalance = -1;
    expect(() => validateBackup(envelope(bad))).toThrow();
    const duplicate = structuredClone(d);
    duplicate.accounts.push(duplicate.accounts[0]);
    expect(() => validateBackup(envelope(duplicate))).toThrow();
    const orphan = structuredClone(d);
    orphan.investments[0].accountId = "missing";
    expect(() => validateBackup(envelope(orphan))).toThrow();
  });
  it("movimenti concorrenti non superano il saldo", async () => {
    const t = {
      accountId: "revolut",
      type: "expense" as const,
      amount: 15000,
      date: today(),
      categoryId: "expense-0",
      description: "",
    };
    const results = await Promise.allSettled([
      saveTransaction(t),
      saveTransaction(t),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await readData()).transactions).toHaveLength(1);
  });
});
