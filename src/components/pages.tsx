"use client";
import { useState } from "react";
import { Plus, Download, Archive, Trash2, WandSparkles } from "lucide-react";
import type { Data, Goal, Investment } from "@/types";
import { db, today } from "@/db";
import {
  accountBalance,
  calculateAccountAvailable,
  calculateAnalytics,
  calculateAvailableToAllocate,
  calculateGoalProgress,
  calculateMonthlyCashflow,
  cents,
  inputMoney,
  investmentPerformance,
  money,
  sum,
  suggestAllocation,
} from "@/finance";
import {
  archiveAccount,
  mutate,
  saveAccount,
  saveAllocation,
  saveGoal,
  saveInvestment,
  uid,
} from "@/lib/actions";
import { exportCSV } from "@/lib/backup";
import { Card, Field, Modal, Progress } from "./ui";
import { typeNames } from "./transaction-form";
export const pillarNames = {
  liquidity: "Liquidità",
  emergency: "Fondo emergenza",
  planned: "Spese previste",
  longterm: "Lungo termine",
};
type Props = { d: Data; notify: (s: string) => void };
export function Transactions({ d }: { d: Data }) {
  const [search, setSearch] = useState(""),
    [type, setType] = useState("all"),
    [account, setAccount] = useState("all");
  const rows = [...d.transactions]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    )
    .filter(
      (t) =>
        (type === "all" || t.type === type) &&
        (account === "all" ||
          t.accountId === account ||
          t.transferAccountId === account) &&
        `${t.description} ${d.categories.find((c) => c.id === t.categoryId)?.name || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  return (
    <Card>
      <div className="toolbar">
        <input
          aria-label="Cerca movimenti"
          placeholder="Cerca descrizione o categoria…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">Tutti i movimenti</option>
          {Object.entries(typeNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Conto"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        >
          <option value="all">Tutti i conti</option>
          {d.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button className="button" onClick={() => exportCSV(d)}>
          <Download size={17} /> CSV
        </button>
      </div>
      <div className="table-wrap">
        <table className="transactions-table">
          <thead>
            <tr>
              <th>Movimento</th>
              <th>Conto</th>
              <th>Categoria</th>
              <th>Data</th>
              <th className="right">Importo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.description || typeNames[t.type]}</strong>
                  <small>{typeNames[t.type]}</small>
                </td>
                <td data-label="Conto">
                  {d.accounts.find((a) => a.id === t.accountId)?.name}
                  {t.transferAccountId &&
                    ` → ${d.accounts.find((a) => a.id === t.transferAccountId)?.name}`}
                </td>
                <td data-label="Categoria">
                  {d.categories.find((c) => c.id === t.categoryId)?.name || "—"}
                </td>
                <td data-label="Data">
                  {new Date(t.date + "T12:00:00").toLocaleDateString("it-IT")}
                </td>
                <td
                  className={`right ${t.type === "income" ? "positive" : t.type === "expense" ? "negative" : ""}`}
                >
                  {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}
                  {money(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="empty">
          <h3>Nessun movimento, per ora</h3>
          <p>
            Registra la prima entrata, uscita o trasferimento con “Nuovo
            movimento”.
          </p>
        </div>
      )}
    </Card>
  );
}
export function Accounts({ d, notify }: Props) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <div className="section-title">
        <p className="muted">
          I luoghi in cui tieni il denaro. Gli obiettivi restano separati.
        </p>
        <button className="button" onClick={() => setOpen(true)}>
          <Plus size={17} /> Aggiungi conto
        </button>
      </div>
      <div className="two-grid">
        {d.accounts.map((a) => (
          <Card key={a.id}>
            <div className="row">
              <h3>{a.name}</h3>
              <span className="pill">
                {a.archived
                  ? "Archiviato"
                  : a.type === "investment"
                    ? "Investimenti"
                    : a.type === "deposit"
                      ? "Deposito"
                      : "Conto corrente"}
              </span>
            </div>
            <h2 className="big-number">
              {money(accountBalance(a, d.transactions, d.investments))}
            </h2>
            <p className="muted">
              Allocazioni virtuali:{" "}
              {money(
                sum(
                  d.allocations
                    .filter((x) => x.accountId === a.id)
                    .map((x) => x.amount),
                ),
              )}
            </p>
            {!a.archived && (
              <button
                className="text-link"
                onClick={async () => {
                  if (
                    !confirm(
                      "Archiviare il conto? La cronologia dei movimenti verrà conservata. Il saldo deve essere zero.",
                    )
                  )
                    return;
                  try {
                    await archiveAccount(a.id);
                    notify("Conto archiviato.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <Archive size={16} /> Archivia
              </button>
            )}
          </Card>
        ))}
      </div>
      {open && (
        <Modal title="Aggiungi conto" onClose={() => setOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const f = new FormData(e.currentTarget);
                await saveAccount({
                  name: String(f.get("name")),
                  type: String(f.get("type")) as "checking",
                  initialBalance: cents(String(f.get("balance"))),
                });
                setOpen(false);
                notify("Conto aggiunto.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field label="Nome">
              <input name="name" required maxLength={100} />
            </Field>
            <Field label="Tipo">
              <select name="type">
                <option value="checking">Conto corrente</option>
                <option value="deposit">Deposito svincolabile</option>
                <option value="investment">
                  Investimenti (saldo iniziale zero)
                </option>
              </select>
            </Field>
            <Field label="Saldo iniziale (€)">
              <input
                name="balance"
                defaultValue="0"
                inputMode="decimal"
                required
              />
            </Field>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button primary wide">Crea conto</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Goals({ d, notify }: Props) {
  const [edit, setEdit] = useState<Goal | null>(null),
    [error, setError] = useState("");
  const emergency = sum(
    d.allocations.filter((a) => a.pillar === "emergency").map((a) => a.amount),
  );
  const emergencyTarget = d.settings[0].emergencyFundTarget;
  return (
    <>
      <div className="section-title">
        <p className="muted">
          Il fondo emergenza viene prima. Poi, i progetti che contano.
        </p>
        <button
          className="button"
          onClick={() =>
            setEdit({
              id: uid(),
              name: "",
              priority: d.goals.length + 1,
              pillar: "planned",
              currentAllocatedAmount: 0,
              status: "active",
              createdAt: new Date().toISOString(),
            })
          }
        >
          <Plus size={17} /> Nuovo obiettivo
        </button>
      </div>
      <Card className="goal-progress-list">
        <div className="goal-progress-row emergency-row">
          <div className="goal-progress-content">
            <div className="row">
              <strong>Fondo emergenza · priorità assoluta</strong>
              <span>
                {money(emergency)} / {money(emergencyTarget)}
              </span>
            </div>
            <Progress value={(emergency / emergencyTarget) * 100} />
          </div>
          <strong className="goal-percent">
            {Math.min(100, Math.round((emergency / emergencyTarget) * 100))}%
          </strong>
        </div>
        {[...d.goals]
          .sort((a, b) => a.priority - b.priority)
          .map((g) => {
            const p = calculateGoalProgress(g, d.allocations, d.investments);
            return (
              <div className="goal-progress-row" key={g.id}>
                <div className="goal-progress-content">
                  <div className="row">
                    <strong>{g.name}</strong>
                    <span>
                      {money(p.amount)}
                      {g.targetAmount
                        ? ` / ${money(g.targetAmount)}`
                        : " · senza target"}
                    </span>
                  </div>
                  <Progress value={p.percent ?? 0} />
                </div>
                <strong className="goal-percent">
                  {p.percent === null ? "—" : `${Math.round(p.percent)}%`}
                </strong>
                <button
                  className="text-link goal-edit"
                  aria-label={`Modifica ${g.name}`}
                  onClick={() => {
                    setError("");
                    setEdit(g);
                  }}
                >
                  Modifica
                </button>
              </div>
            );
          })}
      </Card>
      {edit && (
        <Modal
          title={edit.name || "Nuovo obiettivo"}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const f = new FormData(e.currentTarget);
                await saveGoal({
                  ...edit,
                  name: String(f.get("name")),
                  targetAmount: f.get("target")
                    ? cents(String(f.get("target")))
                    : undefined,
                  priority: Number(f.get("priority")),
                  pillar: String(f.get("pillar")) as Goal["pillar"],
                  description: String(f.get("description")),
                  targetYear: f.get("year") ? Number(f.get("year")) : undefined,
                  deadline: String(f.get("deadline")) || undefined,
                  status: String(f.get("status")) as Goal["status"],
                });
                setEdit(null);
                notify("Obiettivo salvato.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field label="Nome">
              <input name="name" defaultValue={edit.name} required />
            </Field>
            <div className="form-grid">
              <Field label="Target (€), facoltativo">
                <input
                  name="target"
                  inputMode="decimal"
                  defaultValue={
                    edit.targetAmount ? inputMoney(edit.targetAmount) : ""
                  }
                />
              </Field>
              <Field label="Ordine di priorità">
                <input
                  name="priority"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue={edit.priority}
                  required
                />
              </Field>
            </div>
            <Field label="Pilastro">
              <select
                name="pillar"
                defaultValue={edit.pillar}
                disabled={
                  d.allocations.some((a) => a.goalId === edit.id) ||
                  d.investments.some((i) => i.goalId === edit.id)
                }
              >
                {["planned", "longterm"].map((p) => (
                  <option key={p} value={p}>
                    {pillarNames[p as keyof typeof pillarNames]}
                  </option>
                ))}
              </select>
              {(d.allocations.some((a) => a.goalId === edit.id) ||
                d.investments.some((i) => i.goalId === edit.id)) && (
                <input type="hidden" name="pillar" value={edit.pillar} />
              )}
            </Field>
            <Field label="Note / orizzonte">
              <input name="description" defaultValue={edit.description} />
            </Field>
            <div className="form-grid">
              <Field label="Anno desiderato">
                <input
                  name="year"
                  type="number"
                  min="2000"
                  max="2200"
                  defaultValue={edit.targetYear}
                />
              </Field>
              <Field label="Scadenza facoltativa">
                <input
                  name="deadline"
                  type="date"
                  defaultValue={edit.deadline}
                />
              </Field>
            </div>
            <Field label="Stato">
              <select name="status" defaultValue={edit.status}>
                <option value="active">Attivo</option>
                <option value="paused">In pausa</option>
                <option value="completed">Completato</option>
              </select>
            </Field>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary wide">Salva obiettivo</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Investments({ d, notify }: Props) {
  const [edit, setEdit] = useState<Investment | null>(null),
    [error, setError] = useState("");
  return (
    <>
      <div className="section-title">
        <p className="muted">
          Valori aggiornati manualmente · PAC totale{" "}
          {money(sum(d.investments.map((i) => i.monthlyContribution || 0)))}
          /mese
        </p>
        <button
          className="button"
          onClick={() =>
            setEdit({
              id: uid(),
              name: "",
              accountId:
                d.accounts.find((a) => a.type === "investment" && !a.archived)
                  ?.id || "",
              currentValue: 0,
              pillar: "longterm",
              createdAt: new Date().toISOString(),
            })
          }
        >
          <Plus size={17} /> Aggiungi fondo
        </button>
      </div>
      <div className="two-grid">
        {d.investments.map((i) => {
          const p = investmentPerformance(i);
          return (
            <Card key={i.id}>
              <span className="pill">
                {d.accounts.find((a) => a.id === i.accountId)?.name}
              </span>
              <h3 className="spaced">{i.name}</h3>
              <h2 className="big-number">{money(i.currentValue)}</h2>
              <div className="detail-row">
                <span>Capitale versato</span>
                <strong>
                  {i.investedCapital === undefined
                    ? "Da inserire"
                    : money(i.investedCapital)}
                </strong>
              </div>
              <div className="detail-row">
                <span>Guadagno / perdita</span>
                <strong className={p && p.gain >= 0 ? "positive" : ""}>
                  {p
                    ? `${money(p.gain)} (${p.percent === null ? "—" : p.percent.toFixed(2) + "%"})`
                    : "Non disponibile"}
                </strong>
              </div>
              <div className="detail-row">
                <span>PAC mensile</span>
                <strong>{money(i.monthlyContribution || 0)}</strong>
              </div>
              <button
                className="text-link"
                onClick={() => {
                  setError("");
                  setEdit(i);
                }}
              >
                Aggiorna valore e dettagli
              </button>
            </Card>
          );
        })}
      </div>
      <p className="muted">
        Il PAC è un promemoria del contributo previsto: registra ogni versamento
        con “Nuovo movimento”. Per un fondo esistente, inserisci il capitale
        storico per calcolare il rendimento.
      </p>
      {edit && (
        <Modal title="Dettagli investimento" onClose={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const f = new FormData(e.currentTarget);
                await saveInvestment({
                  ...edit,
                  name: String(f.get("name")),
                  accountId: String(f.get("account")),
                  currentValue: cents(String(f.get("value"))),
                  investedCapital: f.get("capital")
                    ? cents(String(f.get("capital")))
                    : undefined,
                  monthlyContribution: cents(String(f.get("pac"))),
                  goalId: String(f.get("goal")) || undefined,
                });
                setEdit(null);
                notify("Investimento aggiornato.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field label="Nome">
              <input name="name" defaultValue={edit.name} required />
            </Field>
            <Field label="Conto investimenti">
              <select name="account" defaultValue={edit.accountId} required>
                {d.accounts
                  .filter((a) => a.type === "investment" && !a.archived)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Valore corrente (€)">
              <input
                name="value"
                inputMode="decimal"
                defaultValue={inputMoney(edit.currentValue)}
                required
              />
            </Field>
            <Field label="Capitale versato residuo (€), se noto">
              <input
                name="capital"
                inputMode="decimal"
                defaultValue={
                  edit.investedCapital === undefined
                    ? ""
                    : inputMoney(edit.investedCapital)
                }
              />
            </Field>
            <Field label="PAC mensile (€)">
              <input
                name="pac"
                inputMode="decimal"
                defaultValue={inputMoney(edit.monthlyContribution || 0)}
                required
              />
            </Field>
            <Field label="Obiettivo">
              <select name="goal" defaultValue={edit.goalId || ""}>
                <option value="">Lungo termine — non assegnato</option>
                {d.goals
                  .filter((g) => g.pillar === "longterm")
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </Field>
            <p className="muted">
              Questa modifica registra una valorizzazione, non un trasferimento
              di denaro. Per un acquisto usa “Nuovo movimento”.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary wide">Salva investimento</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function AllocationPage({ d, notify }: Props) {
  const s = d.settings[0];
  const [account, setAccount] = useState(
    d.accounts.find((a) => !a.archived && a.type !== "investment")?.id || "",
  );
  const [values, setValues] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const a = d.accounts.find((a) => a.id === account);
  const free = calculateAccountAvailable(d, account);
  const keys = [
    { id: "liquidity", name: "Spese correnti" },
    { id: "emergency", name: "Fondo emergenza" },
    ...d.goals
      .filter((g) => g.status === "active")
      .sort((a, b) => a.priority - b.priority),
  ];
  return (
    <>
      <div className="two-grid">
        <Card>
          <div className="eyebrow">DISPONIBILI DA ALLOCARE</div>
          <h2 className="big-number">
            {money(calculateAvailableToAllocate(d))}
          </h2>
          <p className="muted">
            Le allocazioni danno uno scopo ai soldi. Non spostano denaro tra i
            conti.
          </p>
          <Field label="Da quale conto vuoi allocare?">
            <select
              value={account}
              onChange={(e) => {
                setAccount(e.target.value);
                setValues({});
              }}
            >
              {d.accounts
                .filter((a) => !a.archived && a.type !== "investment")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <p>
            Disponibili sul conto: <strong>{money(free)}</strong>
          </p>
          <button
            className="button"
            onClick={() => {
              const cf = calculateMonthlyCashflow(
                d.transactions,
                today(),
                s.firstDayOfMonth,
              );
              const proposed = suggestAllocation(
                Math.max(0, free),
                s,
                cf.expense,
                d.allocations,
                d.goals,
                d.investments,
              );
              setValues(
                Object.fromEntries(
                  Object.entries(proposed).map(([k, v]) => [k, inputMoney(v)]),
                ),
              );
              setError("");
            }}
          >
            <WandSparkles size={18} /> Suggerisci allocazione
          </button>
          <p className="muted spaced">
            Prima le spese del mese, poi l’emergenza. Il surplus segue i pesi
            configurati nelle impostazioni. Puoi modificare ogni importo.
          </p>
        </Card>
        <Card>
          <h3>Decidi tu gli importi</h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await saveAllocation(
                  account,
                  Object.fromEntries(
                    keys.map((k) => [k.id, cents(values[k.id] || "0")]),
                  ),
                );
                setValues({});
                setError("");
                notify("Allocazione confermata.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {keys.map((k) => (
              <Field key={k.id} label={`${k.name} (€)`}>
                <input
                  inputMode="decimal"
                  value={values[k.id] || ""}
                  placeholder="0,00"
                  onChange={(e) =>
                    setValues({ ...values, [k.id]: e.target.value })
                  }
                />
              </Field>
            ))}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary wide" disabled={busy || !a}>
              Conferma allocazione
            </button>
          </form>
        </Card>
      </div>
      <Card className="spaced">
        <h3>Allocazioni attuali</h3>
        {d.allocations
          .filter((x) => x.amount > 0)
          .map((x) => (
            <div className="account-row" key={x.id}>
              <div className="grow">
                <strong>
                  {d.goals.find((g) => g.id === x.goalId)?.name ||
                    pillarNames[x.pillar]}
                </strong>
                <span className="muted">
                  {d.accounts.find((a) => a.id === x.accountId)?.name}
                </span>
              </div>
              <strong>{money(x.amount)}</strong>
              <button
                className="icon-button"
                aria-label="Libera allocazione"
                onClick={async () => {
                  try {
                    await mutate(async () => {
                      await db.allocations.delete(x.id);
                    });
                    notify("Importo nuovamente disponibile.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        {!d.allocations.some((x) => x.amount > 0) && (
          <p className="muted">
            Nessuna allocazione liquida. Inizia con una proposta.
          </p>
        )}
      </Card>
    </>
  );
}
export function Analytics({ d }: { d: Data }) {
  const { months, max, averageExpense, totalSavings, period, snapshots } =
    calculateAnalytics(d, today());
  return (
    <>
      <div className="cashflow-grid">
        <Card>
          <span className="muted">Spesa media · ultimi 6 mesi</span>
          <h2>{money(averageExpense)}</h2>
        </Card>
        <Card>
          <span className="muted">Risparmio · ultimi 6 mesi</span>
          <h2>{money(totalSavings)}</h2>
        </Card>
        <Card>
          <span className="muted">Rilevazioni patrimonio</span>
          <h2>{snapshots.length}</h2>
          <small>Una al giorno, a ogni modifica</small>
        </Card>
      </div>
      <Card>
        <h3>Entrate e uscite mensili</h3>
        <p className="muted">Entrate in verde · uscite in viola</p>
        <div className="chart">
          {months.map((m, i) => (
            <div className="chart-group" key={i}>
              <div className="bars">
                <div
                  title={`Entrate: ${money(m.income)}`}
                  style={{ height: `${(m.income / max) * 100}%` }}
                />
                <div
                  title={`Uscite: ${money(m.expense)}`}
                  style={{ height: `${(m.expense / max) * 100}%` }}
                />
              </div>
              <span>{m.label}</span>
            </div>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mese</th>
                <th>Entrate</th>
                <th>Uscite</th>
                <th>Risparmio</th>
                <th>Tasso</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={i}>
                  <td>{m.label}</td>
                  <td>{money(m.income)}</td>
                  <td>{money(m.expense)}</td>
                  <td>{money(m.savings)}</td>
                  <td>
                    {m.savingsRate === null
                      ? "—"
                      : m.savingsRate.toFixed(1) + "%"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="two-grid spaced">
        <Card>
          <h3>Spese per categoria · mese solare</h3>
          {d.categories
            .filter((c) => period.some((t) => t.categoryId === c.id))
            .map((c) => (
              <div className="detail-row" key={c.id}>
                <span>{c.name}</span>
                <strong>
                  {money(
                    sum(
                      period
                        .filter((t) => t.categoryId === c.id)
                        .map((t) => t.amount),
                    ),
                  )}
                </strong>
              </div>
            ))}
          {!period.length && (
            <p className="muted">
              Registra le prime uscite per vedere la ripartizione.
            </p>
          )}
        </Card>
        <Card>
          <h3>Patrimonio nel tempo</h3>
          {snapshots.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Patrimonio</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.slice(-30).map((s) => (
                    <tr key={s.id}>
                      <td>{s.date}</td>
                      <td>{money(s.netWorth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">
              Le rilevazioni iniziano con la prima modifica ai dati.
            </p>
          )}
        </Card>
      </div>
      <Card className="spaced">
        <h3>Progressione degli obiettivi</h3>
        {d.goals.map((g) => {
          const p = calculateGoalProgress(g, d.allocations, d.investments);
          const first = snapshots.find((s) => s.goalValues[g.id] !== undefined);
          return (
            <div className="detail-row" key={g.id}>
              <span>{g.name}</span>
              <strong>
                {first ? `${money(first.goalValues[g.id])} → ` : ""}
                {money(p.amount)}
              </strong>
            </div>
          );
        })}
      </Card>
    </>
  );
}
