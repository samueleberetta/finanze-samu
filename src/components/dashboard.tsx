"use client";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ShieldCheck,
  ArrowRight,
  Car,
  House,
  Plane,
  Sprout,
} from "lucide-react";
import type { Data } from "@/types";
import {
  accountBalance,
  calculateAvailableToAllocate,
  calculateGoalProgress,
  calculateMonthlyCashflow,
  calculateNetWorth,
  money,
  sum,
} from "@/finance";
import { today } from "@/db";
import { Card, Progress } from "./ui";
const icons = { auto: Car, casa: House, giappone: Plane, longterm: Sprout };
export function Dashboard({ d }: { d: Data }) {
  const n = calculateNetWorth(d),
    s = d.settings[0],
    cf = calculateMonthlyCashflow(d.transactions, today(), s.firstDayOfMonth);
  const emergency = sum(
    d.allocations.filter((a) => a.pillar === "emergency").map((a) => a.amount),
  );
  const available = calculateAvailableToAllocate(d);
  const ep = (emergency / s.emergencyFundTarget) * 100;
  return (
    <>
      <div className="dashboard-top">
        <Card className="wealth">
          <div className="eyebrow">IL TUO PATRIMONIO</div>
          <div className="wealth-value">{money(n.netWorth)}</div>
          <div className="wealth-foot">
            <span>
              <i className="dot mint" /> Liquidità{" "}
              <strong>{money(n.liquidAssets)}</strong>
            </span>
            <span>
              <i className="dot violet" /> Investimenti{" "}
              <strong>{money(n.investments)}</strong>
            </span>
          </div>
          <div className="wealth-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </Card>
        <Card className="available">
          <span className="icon-tile">
            <Wallet size={21} />
          </span>
          <div className="eyebrow">DA ASSEGNARE</div>
          <h2>{money(available)}</h2>
          <p>Dai una direzione ai tuoi risparmi.</p>
          <Link className="text-link" href="/allocation/">
            Alloca i tuoi soldi <ArrowRight size={17} />
          </Link>
        </Card>
      </div>
      <div className="cashflow-grid">
        <Card>
          <span className="metric-label">
            <ArrowDownLeft size={18} className="positive" /> Entrate del mese
          </span>
          <h2>{money(cf.income)}</h2>
          <span className="muted">Solo entrate effettive</span>
        </Card>
        <Card>
          <span className="metric-label">
            <ArrowUpRight size={18} /> Uscite del mese
          </span>
          <h2>{money(cf.expense)}</h2>
          <span className="muted">
            di {money(s.monthlyExpenseEstimate)} stimati
          </span>
        </Card>
        <Card>
          <span className="metric-label">Risparmio del mese</span>
          <h2 className={cf.savings < 0 ? "negative" : "positive"}>
            {money(cf.savings)}
          </h2>
          <span className="muted">
            {cf.savingsRate === null
              ? "Nessuna entrata registrata"
              : `${cf.savingsRate.toFixed(1)}% delle entrate`}
          </span>
        </Card>
      </div>
      <Card className="emergency">
        <div className="emergency-icon">
          <ShieldCheck size={27} />
        </div>
        <div className="grow">
          <div className="row">
            <h3>Prima di tutto, la tranquillità</h3>
            <span className="pill">Fondo emergenza</span>
          </div>
          <p>
            <strong>{money(emergency)}</strong>{" "}
            <span className="muted">di {money(s.emergencyFundTarget)}</span>
          </p>
          <Progress value={ep} />
          <div className="row muted">
            <span>
              {s.monthlyExpenseEstimate
                ? `${(emergency / s.monthlyExpenseEstimate).toFixed(1)} mesi di spese coperti`
                : "Stima spese non impostata"}
            </span>
            <span>{Math.round(ep)}%</span>
          </div>
        </div>
      </Card>
      <div className="section-title">
        <h2>I tuoi prossimi traguardi</h2>
        <Link href="/goals/">
          Tutti gli obiettivi <ArrowRight size={16} />
        </Link>
      </div>
      <div className="goal-grid">
        {[...d.goals]
          .sort((a, b) => a.priority - b.priority)
          .map((g) => {
            const p = calculateGoalProgress(g, d.allocations, d.investments);
            const Icon = icons[g.id as keyof typeof icons] || Sprout;
            return (
              <Card key={g.id} className={`goal-card goal-${g.id}`}>
                <span className="icon-tile">
                  <Icon size={21} />
                </span>
                <span className="goal-priority">
                  {g.priority <= 2
                    ? "Alta priorità"
                    : g.priority === 3
                      ? "Media priorità"
                      : "Bassa priorità"}
                </span>
                <h3>{g.name}</h3>
                <div className="goal-value">{money(p.amount)}</div>
                <p className="muted">
                  {g.targetAmount
                    ? `di ${money(g.targetAmount)}`
                    : "Orizzonte > 10 anni"}
                </p>
                {p.percent !== null ? (
                  <Progress value={p.percent} />
                ) : (
                  <div className="longterm-label">
                    Un passo alla volta, ogni mese
                  </div>
                )}
              </Card>
            );
          })}
      </div>
      <div className="bottom-grid">
        <Card>
          <div className="row">
            <h3>Dove sono i miei soldi?</h3>
            <Link href="/accounts/" aria-label="Vai ai conti">
              <ArrowRight size={18} />
            </Link>
          </div>
          {d.accounts
            .filter((a) => !a.archived)
            .map((a, i) => (
              <div className="account-row" key={a.id}>
                <span className={`bank bank-${i}`}>{a.name.slice(0, 1)}</span>
                <div className="grow">
                  <strong>{a.name}</strong>
                  <span className="muted">
                    {a.type === "investment"
                      ? "Investimenti"
                      : a.type === "deposit"
                        ? "Deposito svincolabile"
                        : "Conto corrente"}
                  </span>
                </div>
                <strong>
                  {money(accountBalance(a, d.transactions, d.investments))}
                </strong>
              </div>
            ))}
        </Card>
        <Card>
          <h3>Per cosa sono allocati?</h3>
          <div className="allocation-bar">
            {(["liquidity", "emergency", "planned", "longterm"] as const).map(
              (p, i) => {
                const val =
                  sum(
                    d.allocations
                      .filter((a) => a.pillar === p)
                      .map((a) => a.amount),
                  ) + (p === "longterm" ? n.investments : 0);
                return (
                  <span
                    key={p}
                    className={`segment s${i}`}
                    style={{ flex: val || 0 }}
                  />
                );
              },
            )}
            <span
              className="segment unallocated"
              style={{ flex: Math.max(0, available) }}
            />
          </div>
          {[
            {
              name: "Liquidità",
              amount: sum(
                d.allocations
                  .filter((a) => a.pillar === "liquidity")
                  .map((a) => a.amount),
              ),
            },
            { name: "Fondo emergenza", amount: emergency },
            ...d.goals.map((g) => ({
              name: g.name,
              amount: calculateGoalProgress(g, d.allocations, d.investments)
                .amount,
            })),
            ...(["planned", "longterm"] as const)
              .map((pillar) => ({
                name:
                  pillar === "longterm"
                    ? "Lungo termine · non assegnato"
                    : "Spese previste · non assegnate",
                amount: sum([
                  ...d.allocations
                    .filter((a) => !a.goalId && a.pillar === pillar)
                    .map((a) => a.amount),
                  ...d.investments
                    .filter((i) => !i.goalId && i.pillar === pillar)
                    .map((i) => i.currentValue),
                ]),
              }))
              .filter((item) => item.amount > 0),
            { name: "Non allocato", amount: available },
          ].map((x, i) => (
            <div className="allocation-row" key={x.name}>
              <span>
                <i className={`dot color-${i % 5}`} />
                {x.name}
              </span>
              <strong>{money(x.amount)}</strong>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
