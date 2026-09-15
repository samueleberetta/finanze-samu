"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Flag,
  ChartNoAxesCombined,
  Layers,
  Settings,
  ShieldCheck,
  Plus,
  Moon,
  Sun,
  Menu,
  X,
  TrendingUp,
} from "lucide-react";
import { db, seed } from "@/db";
import { useFinance } from "@/hooks/use-finance";
import { Dashboard } from "./dashboard";
import {
  Accounts,
  AllocationPage,
  Analytics,
  Goals,
  Investments,
  Transactions,
} from "./pages";
import { SettingsPage } from "./settings";
import { TransactionForm } from "./transaction-form";
import { Modal } from "./ui";
const nav = [
  { id: "dashboard", name: "Panoramica", icon: LayoutDashboard },
  { id: "transactions", name: "Movimenti", icon: ArrowLeftRight },
  { id: "accounts", name: "Conti", icon: Wallet },
  { id: "goals", name: "Obiettivi", icon: Flag },
  { id: "investments", name: "Investimenti", icon: TrendingUp },
  { id: "allocation", name: "Allocazioni", icon: Layers },
  { id: "analytics", name: "Analisi", icon: ChartNoAxesCombined },
  { id: "settings", name: "Impostazioni", icon: Settings },
];
const subtitles: Record<string, string> = {
  dashboard: "Ogni euro, una direzione.",
  transactions: "La tua quotidianità, movimento per movimento.",
  accounts: "Tutti i tuoi conti, in un unico posto.",
  goals: "I progetti di domani iniziano qui.",
  investments: "Il tempo è parte del piano.",
  allocation: "Dai uno scopo a quello che risparmi.",
  analytics: "I numeri raccontano le tue abitudini.",
  settings: "Il tuo piano, le tue preferenze.",
};
export function AppShell({ section = "dashboard" }: { section?: string }) {
  const d = useFinance();
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [modal, setModal] = useState(false),
    [toast, setToast] = useState(""),
    [menu, setMenu] = useState(false),
    [offline, setOffline] = useState(false);
  useEffect(() => {
    seed()
      .then(() => setReady(true))
      .catch((e) =>
        setError(`Impossibile aprire l’archivio locale: ${e.message}`),
      );
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() =>
          setToast(
            "Supporto offline non attivo. Ricarica l’app con una connessione.",
          ),
        );
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (d?.settings[0])
      document.documentElement.dataset.theme = d.settings[0].theme;
  }, [d?.settings]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [menu]);
  if (error)
    return (
      <main className="loading">
        <h1>Archivio non disponibile</h1>
        <p role="alert">{error}</p>
        <p>
          Controlla che il browser consenta l’archiviazione locale, poi ricarica
          la pagina.
        </p>
      </main>
    );
  if (!ready || !d || !d.settings.length)
    return (
      <main className="loading">
        <div className="brand-mark">f.</div>
        <h1>Finanze, con calma.</h1>
        <p>Apertura del tuo archivio locale…</p>
      </main>
    );
  const active = nav.find((n) => n.id === section) || nav[0];
  return (
    <div className="app">
      <aside id="main-menu" className={menu ? "sidebar open" : "sidebar"}>
        <Link href="/dashboard/" className="brand">
          <span className="brand-mark">f.</span>
          <span>
            finanze<span className="brand-dot">.</span>
            <small>LO SPAZIO DI SAMU</small>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          onClick={() => setMenu(false)}
          aria-label="Chiudi menu"
        >
          <X />
        </button>
        <div className="nav-label">IL TUO SPAZIO</div>
        <nav>
          {nav.map(({ id, name, icon: Icon }) => (
            <Link
              key={id}
              href={`/${id}/`}
              className={section === id ? "nav-item active" : "nav-item"}
              onClick={() => setMenu(false)}
              aria-current={section === id ? "page" : undefined}
            >
              <Icon size={19} />
              {name}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Solo sul tuo dispositivo</strong>
              <small>I tuoi dati restano tuoi.</small>
            </div>
          </div>
          <div className="profile">
            <span className="avatar">S</span>
            <div>
              <strong>Samuele</strong>
              <small>Finanza personale</small>
            </div>
            <button
              className="icon-button"
              aria-label="Cambia tema"
              onClick={() =>
                db.settings.update("main", {
                  theme: d.settings[0].theme === "dark" ? "light" : "dark",
                })
              }
            >
              {d.settings[0].theme === "dark" ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Chiudi menu"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-area">
        <header className="topbar">
          <button
            className="mobile-toggle icon-button"
            onClick={() => setMenu(true)}
            aria-label="Apri menu"
            aria-expanded={menu}
            aria-controls="main-menu"
          >
            <Menu />
          </button>
          <span>
            Il mio spazio <span className="breadcrumb">/</span>{" "}
            <strong>{active.name}</strong>
          </span>
          <span className="local-status">
            <ShieldCheck size={15} />
            {offline ? "Modalità offline" : "Archivio locale"}
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {new Date().toLocaleDateString("it-IT", {
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <h1>
                {section === "dashboard"
                  ? "Tutto sotto controllo."
                  : active.name}
              </h1>
              <p>{subtitles[section]}</p>
            </div>
            <button
              className="button primary transaction-cta"
              onClick={() => setModal(true)}
              aria-label="Nuovo movimento"
            >
              <Plus size={22} /> <span>Nuovo movimento</span>
            </button>
          </div>
          {section === "dashboard" && <Dashboard d={d} />}
          {section === "transactions" && <Transactions d={d} />}
          {section === "accounts" && <Accounts d={d} notify={setToast} />}
          {section === "goals" && <Goals d={d} notify={setToast} />}
          {section === "investments" && <Investments d={d} notify={setToast} />}
          {section === "allocation" && (
            <AllocationPage d={d} notify={setToast} />
          )}
          {section === "analytics" && <Analytics d={d} />}
          {section === "settings" && <SettingsPage d={d} notify={setToast} />}
          <footer>
            <ShieldCheck size={14} /> I tuoi dati finanziari vengono salvati
            esclusivamente su questo dispositivo.
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navigazione rapida" inert={menu}>
        {nav
          .filter((item) =>
            ["dashboard", "transactions", "allocation"].includes(item.id),
          )
          .map(({ id, name, icon: Icon }) => (
            <Link
              key={id}
              href={`/${id}/`}
              aria-current={section === id ? "page" : undefined}
            >
              <Icon size={22} />
              <span>{name}</span>
            </Link>
          ))}
        <button
          onClick={() => setMenu(true)}
          aria-expanded={menu}
          aria-controls="main-menu"
        >
          <Menu size={22} />
          <span>Altro</span>
        </button>
      </nav>
      {modal && (
        <Modal title="Nuovo movimento" onClose={() => setModal(false)}>
          <TransactionForm
            d={d}
            onDone={(message) => {
              setModal(false);
              setToast(message);
            }}
          />
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          {toast.includes("disponibili da allocare") && (
            <Link href="/allocation/">Allocazioni</Link>
          )}
          <button
            className="icon-button"
            aria-label="Chiudi notifica"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
