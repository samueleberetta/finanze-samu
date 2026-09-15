"use client";
import { useState } from "react";
import { Download, Upload, ShieldCheck } from "lucide-react";
import type { Data, Category } from "@/types";
import { db } from "@/db";
import { cents, inputMoney, money } from "@/finance";
import { resetData, saveSettings, uid } from "@/lib/actions";
import {
  exportBackup,
  exportCSV,
  importBackup,
  validateBackup,
  readRecovery,
} from "@/lib/backup";
import { Card, Field, Modal } from "./ui";
export function SettingsPage({
  d,
  notify,
}: {
  d: Data;
  notify: (s: string) => void;
}) {
  const s = d.settings[0];
  const [pending, setPending] = useState<Data | null>(null),
    [reset, setReset] = useState(false),
    [phrase, setPhrase] = useState(""),
    [category, setCategory] = useState<Category | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Card className="privacy-card">
        <ShieldCheck size={25} />
        <div>
          <strong>
            I tuoi dati finanziari vengono salvati esclusivamente su questo
            dispositivo.
          </strong>
          <p className="muted">
            Nessun account, nessuna sincronizzazione cloud. Esporta regolarmente
            un backup: cancellare i dati del browser elimina anche quelli
            dell’app.
          </p>
        </div>
      </Card>
      <div className="two-grid spaced">
        <Card>
          <h3>Le tue basi</h3>
          <form
            key={JSON.stringify(s)}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const f = new FormData(e.currentTarget);
                await saveSettings({
                  ...s,
                  monthlyExpenseEstimate: cents(String(f.get("monthly"))),
                  emergencyFundTarget: cents(String(f.get("emergency"))),
                  firstDayOfMonth: Number(f.get("day")),
                  autoPacEnabled: f.get("autoPacEnabled") === "on",
                  autoPacAmount: cents(String(f.get("autoPacAmount"))),
                  autoPacDay: Number(f.get("autoPacDay")),
                  weights: Object.fromEntries(
                    d.goals.map((g) => [g.id, Number(f.get(g.id))]),
                  ),
                });
                notify("Impostazioni salvate.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <Field label="Spese mensili stimate (€)">
              <input
                name="monthly"
                inputMode="decimal"
                defaultValue={inputMoney(s.monthlyExpenseEstimate)}
                required
              />
            </Field>
            <Field label="Target fondo emergenza (€)">
              <input
                name="emergency"
                inputMode="decimal"
                defaultValue={inputMoney(s.emergencyFundTarget)}
                required
              />
            </Field>
            <Field label="Primo giorno del mese contabile">
              <input
                name="day"
                type="number"
                min="1"
                max="28"
                defaultValue={s.firstDayOfMonth}
                required
              />
            </Field>
            <h3 className="spaced">PAC automatico BPM</h3>
            <p className="muted">
              Alla prima apertura dal giorno scelto, sposta la somma da BPM ai
              tre fondi in proporzione ai loro versamenti mensili.
            </p>
            <Field label="Attivo">
              <input
                name="autoPacEnabled"
                type="checkbox"
                defaultChecked={s.autoPacEnabled ?? true}
              />
            </Field>
            <Field label="Importo mensile (€)">
              <input
                name="autoPacAmount"
                inputMode="decimal"
                defaultValue={inputMoney(s.autoPacAmount ?? 25000)}
                required
              />
            </Field>
            <Field label="Giorno del mese">
              <input
                name="autoPacDay"
                type="number"
                min="1"
                max="28"
                defaultValue={s.autoPacDay ?? 3}
                required
              />
            </Field>
            <h3 className="spaced">Pesi del surplus</h3>
            <p className="muted">
              Pesi indicativi modificabili, da usare dopo spese ed emergenza.
              Totale richiesto: 100%.
            </p>
            {d.goals.map((g) => (
              <Field key={g.id} label={`${g.name} (%)`}>
                <input
                  name={g.id}
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  defaultValue={s.weights[g.id] || 0}
                  required
                />
              </Field>
            ))}
            <button className="button primary">Salva impostazioni</button>
          </form>
        </Card>
        <div>
          <Card>
            <h3>Backup e ripristino</h3>
            <p className="muted">
              Il JSON contiene l’intero database. Conserva una copia in un luogo
              sicuro.
            </p>
            <button
              className="button wide"
              onClick={() => exportBackup().catch((e) => notify(e.message))}
            >
              <Download size={18} /> Esporta backup JSON completo
            </button>
            <button className="button wide spaced" onClick={() => exportCSV(d)}>
              <Download size={18} /> Esporta movimenti CSV
            </button>
            <label className="button wide spaced">
              <Upload size={18} /> Importa backup JSON
              <input
                className="sr-only"
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 20000000)
                      throw new Error("Il backup supera il limite di 20 MB.");
                    setPending(validateBackup(JSON.parse(await file.text())));
                  } catch {
                    notify(
                      "Backup incompatibile o non valido. Nessun dato è stato modificato.",
                    );
                  } finally {
                    e.target.value = "";
                  }
                }}
              />
            </label>
            <button
              className="text-link spaced"
              onClick={async () => {
                try {
                  setPending(await readRecovery());
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Ripristina la copia precedente all’ultimo import
            </button>
          </Card>
          <Card className="spaced">
            <h3>Aspetto</h3>
            <Field label="Tema">
              <select
                value={s.theme}
                onChange={async (e) => {
                  await db.settings.update("main", {
                    theme: e.target.value as "light" | "dark",
                  });
                }}
              >
                <option value="light">Chiaro</option>
                <option value="dark">Scuro</option>
              </select>
            </Field>
          </Card>
          <Card className="spaced danger-zone">
            <h3>Elimina tutti i dati</h3>
            <p className="muted">
              Svuota conti, movimenti, investimenti e obiettivi, compresa la
              copia locale di ripristino.
            </p>
            <button className="button danger" onClick={() => setReset(true)}>
              Elimina tutti i dati
            </button>
          </Card>
        </div>
      </div>
      <Card className="spaced">
        <div className="row">
          <h3>Categorie</h3>
          <button
            className="button"
            onClick={() =>
              setCategory({
                id: uid(),
                name: "",
                type: "expense",
                archived: false,
              })
            }
          >
            Nuova categoria
          </button>
        </div>
        <div className="category-grid">
          {d.categories.map((c) => (
            <button
              className={`category ${c.archived ? "archived" : ""}`}
              key={c.id}
              onClick={() => setCategory(c)}
            >
              {c.name}
              <small>
                {c.type === "income" ? "Entrata" : "Uscita"}
                {c.archived ? " · archiviata" : ""}
              </small>
            </button>
          ))}
        </div>
      </Card>
      {category && (
        <Modal title="Categoria" onClose={() => setCategory(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const name = String(f.get("name")).trim();
              if (!name) return;
              await db.categories.put({
                ...category,
                name,
                type: String(f.get("type")) as Category["type"],
                archived: f.get("archived") === "on",
              });
              setCategory(null);
              notify("Categoria salvata.");
            }}
          >
            <Field label="Nome">
              <input
                name="name"
                defaultValue={category.name}
                required
                maxLength={100}
              />
            </Field>
            <Field label="Tipo">
              <select
                name="type"
                defaultValue={category.type}
                disabled={d.transactions.some(
                  (t) => t.categoryId === category.id,
                )}
              >
                <option value="expense">Uscita</option>
                <option value="income">Entrata</option>
              </select>
              {d.transactions.some((t) => t.categoryId === category.id) && (
                <input type="hidden" name="type" value={category.type} />
              )}
            </Field>
            <label className="check">
              <input
                type="checkbox"
                name="archived"
                defaultChecked={category.archived}
              />{" "}
              Archiviata (mantieni la cronologia)
            </label>
            <button className="button primary wide">Salva categoria</button>
          </form>
        </Modal>
      )}
      {pending && (
        <Modal
          title="Conferma ripristino"
          onClose={() => {
            if (!busy) setPending(null);
          }}
        >
          <p>Il backup sostituirà tutti i dati attuali.</p>
          <ul>
            <li>{pending.accounts.length} conti</li>
            <li>{pending.transactions.length} movimenti</li>
            <li>{pending.goals.length} obiettivi</li>
            <li>{pending.investments.length} investimenti</li>
            <li>{pending.allocations.length} allocazioni</li>
            <li>{pending.categories.length} categorie</li>
            <li>
              {pending.investmentTransactions.length} operazioni sui fondi
            </li>
            <li>{pending.recurringTransactions.length} ricorrenze</li>
            <li>{pending.snapshots.length} rilevazioni</li>
            <li>
              Spese mensili: {money(pending.settings[0].monthlyExpenseEstimate)}
            </li>
          </ul>
          <p className="muted">
            Prima della sostituzione verrà salvata una copia locale di sicurezza
            e avviato il download del backup attuale.
          </p>
          <button
            className="button primary wide"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await importBackup(pending);
                setPending(null);
                notify("Backup ripristinato.");
              } catch (e) {
                notify(`Ripristino annullato: ${(e as Error).message}`);
              } finally {
                setBusy(false);
              }
            }}
          >
            Conferma importazione e sostituisci
          </button>
        </Modal>
      )}
      {reset && (
        <Modal
          title="Elimina definitivamente i dati"
          onClose={() => setReset(false)}
        >
          <p>
            Esporta un backup prima di continuare. Per confermare, scrivi{" "}
            <strong>ELIMINA TUTTO</strong>.
          </p>
          <Field label="Conferma eliminazione">
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <button
            className="button danger wide"
            disabled={phrase !== "ELIMINA TUTTO" || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await resetData();
                setReset(false);
                setPhrase("");
                notify(
                  "Dati eliminati. Puoi ripartire da zero o importare un backup.",
                );
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Elimina definitivamente
          </button>
        </Modal>
      )}
    </>
  );
}
