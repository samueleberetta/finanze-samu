# Finanze Samu

Webapp personale local-first con Next.js, TypeScript strict, Tailwind CSS e Dexie/IndexedDB. Nessun backend, autenticazione, database cloud o API finanziaria. Repository: https://github.com/samueleberetta/finanze-samu. Il deploy su Vercel è un passaggio successivo.

## Installazione e sviluppo

Richiede Node.js 22 o superiore e npm.

```sh
npm install
npm run dev
```

Apri http://localhost:3000. Le route disponibili sono `/`, `/dashboard`, `/transactions`, `/accounts`, `/goals`, `/investments`, `/allocation`, `/analytics`, `/settings`.

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

La build produce `out/`, sito completamente statico. Per provarla usa un server statico (per esempio `python3 -m http.server 3000 --directory out`). `npm start` avvia questo server statico (richiede Python 3). Non sono necessarie variabili d'ambiente o chiavi API.

## Dati e modello finanziario

Tutti gli importi persistiti sono **centesimi interi**; l'input decimale viene convertito per parti senza moltiplicazioni floating point. Il denaro viene sommato con controlli sugli interi sicuri; la ripartizione ponderata usa BigInt. Percentuali e visualizzazione della valuta usano numeri decimali solo in presentazione.

I conti liquidi sono calcolati a partire da saldo iniziale e movimenti. I conti investimento derivano invece dal valore dei singoli fondi: `initialBalance` è il valore storico iniziale e non viene sommato ai fondi. Trasferimenti, investimenti e disinvestimenti non entrano nelle entrate/uscite mensili e conservano il patrimonio complessivo. La valorizzazione manuale di un fondo modifica il patrimonio.

Le allocazioni sono classificazioni virtuali per conto e obiettivo e non alterano i saldi. Non possono superare il saldo del conto né la liquidità complessiva. Una spesa consuma prima la relativa allocazione per spese correnti; le allocazioni protette non vengono ridotte automaticamente. Se un movimento le renderebbe superiori al saldo, viene annullato: libera prima gli importi nella pagina Allocazioni, quindi registra il movimento. I trasferimenti non spostano automaticamente le allocazioni.

Il database viene inizializzato con BPM €1.232,20, Revolut €208,49, Revolut deposito €72,09, Contanti €0 e i tre fondi Anima nel conto Investimenti BPM per €1.891,24: patrimonio iniziale **€3.404,02**. La liquidità iniziale resta non allocata, poiché non è stata specificata una distribuzione confermata. I fondi sono associati al lungo termine. Il capitale versato iniziale è sconosciuto e resta vuoto, non viene inventato dal valore corrente.

Il PAC automatico è inizialmente attivo per €250 il giorno 3 di ogni mese. Viene eseguito una sola volta al mese alla prima apertura dell’app dal giorno 3 in poi, rispettando le allocazioni protette e distribuendo la somma tra i tre fondi. Importo, giorno e attivazione si modificano nelle impostazioni.

Per investimenti esistenti, inserisci il capitale residuo noto e il valore attuale. Per nuovi acquisti, crea prima il fondo con valore zero, poi registra un movimento investimento. Nei disinvestimenti il capitale residuo noto è ridotto proporzionalmente al valore liquidato; il rendimento mostrato riguarda la posizione residua, non include rendimenti realizzati storici. Il PAC è descrittivo, senza addebiti automatici.

Il suggerimento di allocazione è deterministico: copertura mensile mancante, emergenza, poi pesi configurabili. Obiettivi in pausa/completati sono esclusi. I target limitano le nuove assegnazioni; l'eventuale residuo resta non allocato. Nessuna assegnazione viene scritta prima della conferma. Un investimento liquido assegnato al lungo termine rimane liquidità finché non viene effettivamente investito: libera la relativa allocazione prima del versamento.

## Privacy e persistenza

Le dieci tabelle sono in IndexedDB sul browser e sull'origine che ospita l'app. Vercel distribuisce soltanto file statici: nessun dato finanziario viene inviato al server. Non ci sono font remoti, tracker o integrazioni esterne. La cache del service worker contiene solo il codice dell'app, non i dati finanziari. Il provider hosting può avere normali log delle richieste dei file statici.

La CLI Supabase è inizializzata e il repository è collegato al progetto `ohdnwrjhdtrevnviapsj` per gli sviluppi successivi. L'app attuale non importa il client Supabase e non invia ancora autenticazione o dati finanziari al progetto remoto.

Non esiste sincronizzazione fra dispositivi o browser. Cambiare dominio/porta significa un archivio diverso. Cancellare i dati del sito, usare navigazione privata o la pulizia automatica del browser può eliminare il database. I dati non sono cifrati dall'app: la protezione del dispositivo e del profilo browser è responsabilità dell'utente.

## Backup e ripristino

1. In Impostazioni scegli **Esporta backup JSON completo**. Il file `finance-backup-YYYY-MM-DD.json` include schema versione 1 e tutte le tabelle, comprese impostazioni, ricorrenze e snapshot.
2. Per ripristinare, seleziona il JSON. L'app valida tipi, interi, date, riferimenti, duplicati, coerenza delle allocazioni e versione.
3. Leggi il riepilogo e conferma la sostituzione. Prima di scrivere, l'app salva lo stato precedente in una copia locale di recupero in un archivio IndexedDB separato e avvia il download di un JSON `pre-import`. Se la copia locale non può essere salvata (ad esempio quota esaurita), l'import viene annullato.
4. Tutte le tabelle vengono sostituite in una singola transazione IndexedDB. Il pulsante per la copia precedente permette di annullare l'ultimo import. Il download resta soggetto alle impostazioni del browser: verifica che il file sia stato conservato.

Il CSV include almeno tutti i movimenti con conti, categorie e importi in euro; è per consultazione e non sostituisce il backup JSON. I campi sono quotati e protetti dall'interpretazione come formule nei fogli di calcolo.

**Elimina tutti i dati** richiede la frase `ELIMINA TUTTO`, elimina anche la copia locale pre-import e lascia l'app vuota, senza reinserire automaticamente i dati iniziali.

## PWA e offline

La build genera un service worker con cache versionata di tutte le pagine e degli asset. Visita una volta l'app online, attendi l'installazione della cache, poi puoi aprire tutte le sezioni offline. L'installazione come app è disponibile dai menu dei browser compatibili (su iOS: Condividi → Aggiungi alla schermata Home). Sono necessari HTTPS o localhost. In sviluppo il service worker non viene registrato: la verifica offline va eseguita sulla build statica. Un aggiornamento entra in uso dopo la chiusura delle schede della versione precedente.

## Analisi e limiti MVP

Analisi di base: sei mesi di entrate/uscite, risparmio e tasso (non definito con entrate zero), media spese su sei mesi inclusi quelli senza movimenti, spese per categoria nel mese solare e rilevazioni giornaliere di patrimonio/obiettivi. Il primo giorno contabile è configurabile da 1 a 28. Gli snapshot partono dalle modifiche effettive, senza inventare una storia passata, e l'ultima modifica del giorno aggiorna la rilevazione giornaliera.

La tabella delle ricorrenze è predisposta e inclusa nei backup; la gestione automatica delle ricorrenze e le analisi avanzate non fanno parte di questo MVP. I movimenti registrati restano nella cronologia, senza modifica o eliminazione dalla UI. I conti si archiviano solo a saldo zero, conservando i movimenti.

## Deploy Vercel (successivo)

1. Usa il repository GitHub `samueleberetta/finanze-samu`.
2. Importalo in Vercel; build command `npm run build`, output directory `out` (configurato anche in `vercel.json`).
3. Non configurare database, variabili segrete o API. Il deploy ospita soltanto gli asset statici.
4. Verifica installazione e offline in HTTPS. Esporta i dati dal vecchio dominio e importali nel nuovo, se cambi origine.

## Organizzazione

- `src/db`: schema Dexie, lettura e dati iniziali.
- `src/finance`: calcoli puri e algoritmo di allocazione.
- `src/lib`: operazioni atomiche, backup e validazione.
- `src/hooks`: aggiornamenti reattivi IndexedDB.
- `src/components`: interfaccia e form.
- `src/app`: route statiche e tema responsive.
- `tests`: test contabili e di integrità con IndexedDB simulato.
