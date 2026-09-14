import type {
  Account,
  Allocation,
  Data,
  Goal,
  Investment,
  Settings,
  Transaction,
} from "@/types";
export const sum = (values: number[]) => {
  const result = values.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(result)) throw new Error("Importo fuori limite.");
  return result;
};
export function cents(value: string): number {
  const v = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(v))
    throw new Error("Inserisci un importo positivo con massimo due decimali.");
  const [whole, decimal = ""] = v.split(".");
  const n = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(n)) throw new Error("Importo troppo grande.");
  return n;
}
export const money = (n: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    useGrouping: "always",
  }).format(n / 100);
export const inputMoney = (n: number) => (n / 100).toFixed(2);
export function accountBalance(
  account: Account,
  transactions: Transaction[],
  investments: Investment[],
): number {
  if (account.type === "investment")
    return sum(
      investments
        .filter((i) => i.accountId === account.id)
        .map((i) => i.currentValue),
    );
  return sum([
    account.initialBalance,
    ...transactions.map((t) =>
      t.accountId === account.id
        ? t.type === "income" || t.type === "withdrawal"
          ? t.amount
          : -t.amount
        : t.type === "transfer" && t.transferAccountId === account.id
          ? t.amount
          : 0,
    ),
  ]);
}
export function calculateNetWorth(
  d: Pick<Data, "accounts" | "transactions" | "investments">,
) {
  const liquidAssets = sum(
    d.accounts
      .filter((a) => a.type !== "investment")
      .map((a) => accountBalance(a, d.transactions, d.investments)),
  );
  const investments = sum(d.investments.map((i) => i.currentValue));
  return {
    liquidAssets,
    investments,
    netWorth: sum([liquidAssets, investments]),
  };
}
export function periodStart(date: string, firstDay = 1) {
  const d = new Date(date + "T12:00:00");
  if (d.getDate() < firstDay) d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(firstDay).padStart(2, "0")}`;
}
export function calculateMonthlyCashflow(
  transactions: Transaction[],
  date: string,
  firstDay = 1,
) {
  const key = periodStart(date, firstDay);
  const rows = transactions.filter(
    (t) => periodStart(t.date, firstDay) === key,
  );
  const income = sum(
    rows.filter((t) => t.type === "income").map((t) => t.amount),
  );
  const expense = sum(
    rows.filter((t) => t.type === "expense").map((t) => t.amount),
  );
  return {
    income,
    expense,
    savings: income - expense,
    savingsRate: income ? ((income - expense) / income) * 100 : null,
  };
}
export function calculateGoalProgress(
  goal: Goal,
  allocations: Allocation[],
  investments: Investment[],
) {
  const amount = sum([
    ...allocations.filter((a) => a.goalId === goal.id).map((a) => a.amount),
    ...investments
      .filter((i) => i.goalId === goal.id)
      .map((i) => i.currentValue),
  ]);
  return {
    amount,
    percent: goal.targetAmount
      ? Math.min(100, (amount / goal.targetAmount) * 100)
      : null,
  };
}
export function calculateAvailableToAllocate(
  d: Pick<Data, "accounts" | "transactions" | "investments" | "allocations">,
) {
  return (
    calculateNetWorth(d).liquidAssets - sum(d.allocations.map((a) => a.amount))
  );
}
export function validateAllocations(
  d: Pick<Data, "accounts" | "transactions" | "investments">,
  allocations: Allocation[],
) {
  if (allocations.some((a) => !Number.isSafeInteger(a.amount) || a.amount < 0))
    throw new Error("Allocazioni non valide.");
  for (const a of allocations)
    if (
      !d.accounts.some((x) => x.id === a.accountId && x.type !== "investment")
    )
      throw new Error("Conto allocazione non valido.");
  for (const account of d.accounts.filter((a) => a.type !== "investment")) {
    const allocated = sum(
      allocations
        .filter((a) => a.accountId === account.id)
        .map((a) => a.amount),
    );
    if (
      allocated >
      Math.max(0, accountBalance(account, d.transactions, d.investments))
    )
      throw new Error(
        `Allocazioni superiori al saldo di ${account.name}. Libera prima le allocazioni.`,
      );
  }
  if (
    sum(allocations.map((a) => a.amount)) >
    Math.max(0, calculateNetWorth(d).liquidAssets)
  )
    throw new Error("Liquidità insufficiente.");
  return true;
}
export function suggestAllocation(
  available: number,
  settings: Settings,
  expense: number,
  allocations: Allocation[],
  goals: Goal[],
  investments: Investment[],
) {
  let left = Math.max(0, available);
  const result: Record<string, number> = { liquidity: 0, emergency: 0 };
  const covered = sum(
    allocations.filter((a) => a.pillar === "liquidity").map((a) => a.amount),
  );
  result.liquidity = Math.min(
    left,
    Math.max(0, settings.monthlyExpenseEstimate - expense - covered),
  );
  left -= result.liquidity;
  result.emergency = Math.min(
    left,
    Math.max(
      0,
      settings.emergencyFundTarget -
        sum(
          allocations
            .filter((a) => a.pillar === "emergency")
            .map((a) => a.amount),
        ),
    ),
  );
  left -= result.emergency;
  const eligible = goals
    .filter((g) => g.status === "active" && (settings.weights[g.id] || 0) > 0)
    .sort((a, b) => a.priority - b.priority);
  const weights = eligible.reduce((s, g) => s + settings.weights[g.id], 0);
  const surplus = left;
  for (const [idx, g] of eligible.entries()) {
    const share =
      idx === eligible.length - 1
        ? left
        : Number(
            (BigInt(surplus) * BigInt(settings.weights[g.id])) /
              BigInt(weights),
          );
    const room =
      g.targetAmount === undefined
        ? share
        : Math.max(
            0,
            g.targetAmount -
              calculateGoalProgress(g, allocations, investments).amount,
          );
    result[g.id] = Math.min(left, share, room);
    left -= result[g.id];
  }
  return result;
}
export function investmentPerformance(i: Investment) {
  return i.investedCapital === undefined
    ? null
    : {
        gain: i.currentValue - i.investedCapital,
        percent: i.investedCapital
          ? ((i.currentValue - i.investedCapital) / i.investedCapital) * 100
          : null,
      };
}

export function calculateAccountAvailable(
  d: Pick<Data, "accounts" | "transactions" | "investments" | "allocations">,
  accountId: string,
) {
  const account = d.accounts.find((a) => a.id === accountId);
  return account
    ? accountBalance(account, d.transactions, d.investments) -
        sum(
          d.allocations
            .filter((a) => a.accountId === accountId)
            .map((a) => a.amount),
        )
    : 0;
}
export function calculateAnalytics(d: Data, date: string) {
  const now = new Date(date + "T12:00:00");
  const months = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - 5 + i, 15);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(d.settings[0].firstDayOfMonth).padStart(2, "0")}`;
    return {
      label: dt.toLocaleDateString("it-IT", { month: "short" }),
      ...calculateMonthlyCashflow(
        d.transactions,
        key,
        d.settings[0].firstDayOfMonth,
      ),
    };
  });
  return {
    months,
    max: Math.max(1, ...months.flatMap((m) => [m.income, m.expense])),
    averageExpense: Math.round(sum(months.map((m) => m.expense)) / 6),
    totalSavings: sum(months.map((m) => m.savings)),
    period: d.transactions.filter(
      (t) => t.type === "expense" && t.date.slice(0, 7) === date.slice(0, 7),
    ),
    snapshots: [...d.snapshots].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
