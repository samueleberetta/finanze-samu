export type Pillar = "liquidity" | "emergency" | "planned" | "longterm";
export interface Account {
  id: string;
  name: string;
  type: "checking" | "deposit" | "investment";
  initialBalance: number;
  createdAt: string;
  archived: boolean;
}
export interface Transaction {
  id: string;
  accountId: string;
  type: "income" | "expense" | "transfer" | "investment" | "withdrawal";
  amount: number;
  date: string;
  categoryId: string;
  description: string;
  transferAccountId?: string;
  investmentId?: string;
  createdAt: string;
}
export interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  icon?: string;
  archived: boolean;
}
export interface Goal {
  id: string;
  name: string;
  targetAmount?: number;
  currentAllocatedAmount: number;
  priority: number;
  pillar: Pillar;
  deadline?: string;
  targetYear?: number;
  description?: string;
  status: "active" | "completed" | "paused";
  createdAt: string;
}
export interface Allocation {
  id: string;
  accountId: string;
  goalId?: string;
  pillar: Pillar;
  amount: number;
  createdAt: string;
  updatedAt: string;
}
export interface Investment {
  id: string;
  name: string;
  accountId: string;
  currentValue: number;
  investedCapital?: number;
  monthlyContribution?: number;
  goalId?: string;
  pillar: Pillar;
  createdAt: string;
}
export interface InvestmentTransaction {
  id: string;
  investmentId: string;
  type: "contribution" | "withdrawal" | "value_update";
  amount: number;
  date: string;
  notes?: string;
}
export interface RecurringTransaction {
  id: string;
  accountId: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string;
  description: string;
  nextDate: string;
  enabled: boolean;
}
export interface Settings {
  id: "main";
  monthlyExpenseEstimate: number;
  emergencyFundTarget: number;
  currency: "EUR";
  firstDayOfMonth: number;
  weights: Record<string, number>;
  theme: "light" | "dark";
  dataVersion?: number;
  autoPacEnabled?: boolean;
  autoPacAmount?: number;
  autoPacDay?: number;
  autoPacLastMonth?: string;
}
export interface Snapshot {
  id: string;
  date: string;
  netWorth: number;
  liquidAssets: number;
  investments: number;
  goalValues: Record<string, number>;
}
export interface Data {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  goals: Goal[];
  allocations: Allocation[];
  investments: Investment[];
  investmentTransactions: InvestmentTransaction[];
  recurringTransactions: RecurringTransaction[];
  settings: Settings[];
  snapshots: Snapshot[];
}
