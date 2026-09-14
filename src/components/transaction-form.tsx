"use client";
import { useState } from "react";
import type { Data, Transaction } from "@/types";
import { Field } from "./ui";
import { today } from "@/db";
import { cents, money } from "@/finance";
import { saveTransaction } from "@/lib/actions";
export const typeNames = {
  income: "Entrata",
  expense: "Uscita",
  transfer: "Trasferimento",
  investment: "Investimento",
  withdrawal: "Disinvestimento",
};
export function TransactionForm({
  d,
  onDone,
}: {
  d: Data;
  onDone: (message: string) => void;
}) {
  const [type, setType] = useState<Transaction["type"]>("expense");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const liquid = d.accounts.filter(
    (a) => !a.archived && a.type !== "investment",
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const f = new FormData(e.currentTarget);
          const amount = cents(String(f.get("amount")));
          await saveTransaction({
            type,
            accountId: String(f.get("account")),
            amount,
            date: String(f.get("date")),
            description: String(f.get("description")),
            categoryId: String(f.get("category") || ""),
            ...(type === "transfer"
              ? { transferAccountId: String(f.get("destination")) }
              : {}),
            ...(["investment", "withdrawal"].includes(type)
              ? { investmentId: String(f.get("investment")) }
              : {}),
          });
          onDone(
            type === "income"
              ? `${money(amount)} disponibili da allocare. Entrata registrata.`
              : "Movimento registrato.",
          );
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Tipo di movimento">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as Transaction["type"])}
        >
          {Object.entries(typeNames).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Importo (€)">
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            required
            autoFocus
          />
        </Field>
        <Field label="Data">
          <input
            name="date"
            type="date"
            defaultValue={today()}
            max={today()}
            required
          />
        </Field>
      </div>
      <Field label={type === "withdrawal" ? "Conto di accredito" : "Conto"}>
        <select name="account" required>
          {liquid.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      {type === "transfer" && (
        <Field label="Conto di destinazione">
          <select name="destination">
            {liquid.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {["investment", "withdrawal"].includes(type) && (
        <>
          <Field label="Fondo">
            <select name="investment" required>
              {d.investments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="muted">
            Il movimento sposta denaro tra conto e fondo. Il patrimonio totale
            resta invariato; puoi aggiornare separatamente la valorizzazione.
          </p>
        </>
      )}
      {["income", "expense"].includes(type) && (
        <Field label="Categoria">
          <select name="category" key={type} required>
            {d.categories
              .filter((c) => c.type === type && !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Field label="Descrizione">
        <input
          name="description"
          placeholder="Aggiungi una nota"
          maxLength={2000}
        />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary wide" disabled={busy || !liquid.length}>
        {busy ? "Salvataggio…" : "Registra movimento"}
      </button>
    </form>
  );
}
