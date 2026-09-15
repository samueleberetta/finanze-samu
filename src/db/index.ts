import Dexie, { type EntityTable } from "dexie";
import type { Data } from "@/types";
export class FinanceDB extends Dexie {
  accounts!: EntityTable<Data["accounts"][number], "id">;
  transactions!: EntityTable<Data["transactions"][number], "id">;
  categories!: EntityTable<Data["categories"][number], "id">;
  goals!: EntityTable<Data["goals"][number], "id">;
  allocations!: EntityTable<Data["allocations"][number], "id">;
  investments!: EntityTable<Data["investments"][number], "id">;
  investmentTransactions!: EntityTable<
    Data["investmentTransactions"][number],
    "id"
  >;
  recurringTransactions!: EntityTable<
    Data["recurringTransactions"][number],
    "id"
  >;
  settings!: EntityTable<Data["settings"][number], "id">;
  snapshots!: EntityTable<Data["snapshots"][number], "id">;
  constructor(name = "finanze-samu") {
    super(name);
    this.version(1).stores({
      accounts: "id",
      transactions: "id,accountId,date",
      categories: "id",
      goals: "id",
      allocations: "id,accountId,goalId",
      investments: "id,accountId",
      investmentTransactions: "id,investmentId,date",
      recurringTransactions: "id,nextDate",
      settings: "id",
      snapshots: "id,date",
    });
  }
}
export const db = new FinanceDB();
export const tableNames: (keyof Data)[] = [
  "accounts",
  "transactions",
  "categories",
  "goals",
  "allocations",
  "investments",
  "investmentTransactions",
  "recurringTransactions",
  "settings",
  "snapshots",
];
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export async function readData(): Promise<Data> {
  const rows = await Promise.all(tableNames.map((k) => db.table(k).toArray()));
  return Object.fromEntries(
    tableNames.map((k, i) => [k, rows[i]]),
  ) as unknown as Data;
}
export async function seed() {
  await db.transaction("rw", db.tables, async () => {
    const now = new Date().toISOString();
    const obsoletePac = await db.accounts.get("bpm-pac");
    if (obsoletePac) {
      const hasMovements = await db.transactions
        .filter(
          (transaction) =>
            transaction.accountId === "bpm-pac" ||
            transaction.transferAccountId === "bpm-pac",
        )
        .count();
      const hasAllocations = await db.allocations
        .where("accountId")
        .equals("bpm-pac")
        .count();
      if (
        !hasMovements &&
        !hasAllocations &&
        obsoletePac.initialBalance === 0
      ) {
        await db.accounts.delete("bpm-pac");
      }
    }
    const additionalAccounts: Data["accounts"] = [
      {
        id: "contanti",
        name: "Contanti",
        type: "checking",
        initialBalance: 0,
        createdAt: now,
        archived: false,
      },
    ];
    for (const account of additionalAccounts) {
      if (!(await db.accounts.get(account.id))) await db.accounts.add(account);
    }
    const existingSettings = await db.settings.get("main");
    if (existingSettings) {
      if ((existingSettings.dataVersion ?? 1) < 2) {
        const currentMonth = today().slice(0, 7);
        const targets: Record<string, number> = {
          bpm: 123220,
          revolut: 20849,
          deposito: 7209,
        };
        const transactions = await db.transactions.toArray();
        for (const [id, target] of Object.entries(targets)) {
          const account = await db.accounts.get(id);
          if (!account) continue;
          const movementDelta = transactions.reduce(
            (total, transaction) =>
              total +
              (transaction.accountId === id
                ? transaction.type === "income" ||
                  transaction.type === "withdrawal"
                  ? transaction.amount
                  : -transaction.amount
                : transaction.type === "transfer" &&
                    transaction.transferAccountId === id
                  ? transaction.amount
                  : 0),
            0,
          );
          await db.accounts.update(id, {
            initialBalance: target - movementDelta,
          });
        }
        await db.investments.update("america", { currentValue: 64010 });
        await db.investments.update("bilanciato", { currentValue: 61671 });
        await db.investments.update("globale", { currentValue: 63443 });
        await db.goals.update("longterm", { currentAllocatedAmount: 189124 });
        await db.settings.update("main", {
          dataVersion: 2,
          autoPacEnabled: true,
          autoPacAmount: 25000,
          autoPacDay: 3,
          autoPacLastMonth: currentMonth,
        });
      }
      return;
    }
    await db.settings.put({
      id: "main",
      monthlyExpenseEstimate: 50000,
      emergencyFundTarget: 300000,
      currency: "EUR",
      firstDayOfMonth: 1,
      weights: { auto: 50, longterm: 25, casa: 20, giappone: 5 },
      theme: "light",
      dataVersion: 2,
      autoPacEnabled: true,
      autoPacAmount: 25000,
      autoPacDay: 3,
      autoPacLastMonth: today().slice(0, 7),
    });
    await db.accounts.bulkPut(
      [
        { id: "bpm", name: "BPM", type: "checking", initialBalance: 123220 },
        {
          id: "revolut",
          name: "Revolut",
          type: "checking",
          initialBalance: 20849,
        },
        {
          id: "deposito",
          name: "Revolut deposito",
          type: "deposit",
          initialBalance: 7209,
        },
        {
          id: "investimenti",
          name: "Investimenti BPM",
          type: "investment",
          initialBalance: 0,
        },
        ...additionalAccounts,
      ].map((a) => ({
        ...a,
        createdAt: now,
        archived: false,
      })) as Data["accounts"],
    );
    await db.goals.bulkPut(
      [
        {
          id: "auto",
          name: "Auto",
          targetAmount: 2000000,
          priority: 1,
          pillar: "planned",
          targetYear: 2027,
          description: "Acquisto auto · anno desiderato 2027",
        },
        {
          id: "longterm",
          name: "Lungo termine",
          priority: 2,
          pillar: "longterm",
          description: "Orizzonte superiore a 10 anni",
        },
        {
          id: "casa",
          name: "Casa",
          targetAmount: 5000000,
          priority: 3,
          pillar: "planned",
          description: "Anticipo casa · target provvisorio · circa 7 anni",
        },
        {
          id: "giappone",
          name: "Giappone",
          targetAmount: 300000,
          priority: 4,
          pillar: "planned",
          description: "Un viaggio da costruire, senza scadenza",
        },
      ].map((g) => ({
        ...g,
        currentAllocatedAmount: g.id === "longterm" ? 189124 : 0,
        status: "active",
        createdAt: now,
      })) as Data["goals"],
    );
    await db.investments.bulkPut(
      [
        { id: "america", name: "Anima America A", currentValue: 64010 },
        {
          id: "bilanciato",
          name: "Anima ESaloGo Bilanciato A",
          currentValue: 61671,
        },
        { id: "globale", name: "Anima Valore Globale A", currentValue: 63443 },
      ].map((i) => ({
        ...i,
        accountId: "investimenti",
        monthlyContribution: 5000,
        goalId: "longterm",
        pillar: "longterm",
        createdAt: now,
      })),
    );
    const categories: Data["categories"] = [];
    for (const [type, names] of Object.entries({
      expense: [
        "Alimentari",
        "Benzina",
        "Trasporti",
        "Auto",
        "Salute",
        "Sport",
        "Abbonamenti",
        "Svago",
        "Shopping",
        "Viaggi",
        "Casa",
        "Regali",
        "Altro",
      ],
      income: ["Stipendio", "Lavoro", "Extra", "Rimborso", "Vendita", "Altro"],
    })) {
      names.forEach((name, i) =>
        categories.push({
          id: `${type}-${i}`,
          name,
          type: type as "income" | "expense",
          archived: false,
        }),
      );
    }
    await db.categories.bulkPut(categories);
  });
}
