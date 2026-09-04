# Qualità dell'aria — MVP

Strumento per leggere i dati ARPA Lombardia sulla qualità dell'aria: quante
volte i limiti di legge sono stati superati, dove, e come sono andate le cose
nel tempo. C'è anche un assistente a cui si possono fare domande in italiano.

È un prototipo. Più avanti ho descritto cosa ho sviluppato (quale parti) e cosa ho lasciato fuori e perché.

## Avvio

```bash
docker compose up -d                    # per Postgres
pip install -r ingest/requirements.txt
python ingest/ingest.py                 # carica i CSV nel database

cp .env.example .env                    # e inserisci LLM_API_KEY
npm install
npm run dev                             # http://localhost:3000
```

L'assistente usa un endpoint OpenAI-compatibile. Nel `.env.example` ho messo
Groq, che ha un piano gratuito e non chiede la carta di credito. La dashboard funziona anche senza chiave: non funziona solo l'assistente.

```bash
npm run test              # test sulla logica pura
npm run typecheck
python ingest/verify.py   # ricalcola gli stessi numeri con pandas
```

## Com'è fatto

I dati si muovono in una direzione sola:

```
CSV ──▶ ingest (Python) ──▶ Postgres ──▶ dominio (TS) ──┬──▶ API ──▶ pagina web
                                                        └──▶ tool ──▶ assistente
```

| Livello | File | Cosa fa |
|---|---|---|

| Ingest | `ingest/ingest.py` | Pulisce i CSV e li carica. Si esegue una volta. |
| Schema | `db/schema.sql` | Due tabelle: `sensors`, `measurements`. |
| Dominio | `src/lib/domain.ts` | Tutto l'SQL e tutta la logica sulle soglie. |
| Configurazione | `src/lib/pollutants.ts` | Limiti e basi temporali. Nessun accesso al DB. |
| API | `src/app/api/*` | Espone il dominio su HTTP. |
| Pagina | `src/components/*` | Filtri, tabella dei superamenti, grafico. |
| Assistente | `src/lib/tools.ts`, `assistant.ts` | Tool calling sopra lo stesso dominio. |

**Perché la pagina e l'assistente passano tutti e due dal dominio?** Se ognuno
si scrivesse le proprie query, prima o poi darebbero due numeri diversi per la
stessa domanda. In uno strumento che serve a compilare una relazione ufficiale
e' molto problematico. Con un solo punto di verità, se correggo
un'aggregazione la correzione arriva a tutti e due nello stesso momento.

## Cosa ho trovato nei dati

Ho esplorato il dataset prima di scrivere codice. Quattro cose hanno cambiato
il progetto.

**Le granularità non coincidono.** NO2 e ozono sono orari, circa 24 rilevazioni
al giorno per sensore; PM10 e PM2.5 sono giornalieri. Anche i limiti di legge
sono definiti su basi diverse. Con una funzione di aggregazione unica avrei
ottenuto numeri sbagliati per metà degli inquinanti, quindi in `pollutants.ts`
la base temporale del limite e quella del dato sono due campi separati, e il
codice li confronta prima di decidere come calcolare.

**Il valore mancante è `-9999`, con `stato = 'NA'`.** Sono 2.346 record su
118.856. Li scarto nell'ingest invece di caricarli e filtrarli nelle query:
così la tabella `measurements` non può contenere un valore che non va mediato,
e nessuna query a valle deve ricordarsi di escluderlo (scelta molto piu' pulita). Una riga dimenticata in
un `WHERE` avrebbe spostato una media di migliaia di unità senza dare nessun
segnale.

Una nota : leggo il CSV con il modulo `csv` e non con pandas, perché
pandas converte la stringa `NA` in `NaN` e le righe da riconoscere spariscono
prima ancora di essere viste.

**Dodici righe ripetute.** Il file contiene 12 coppie (sensore, istante)
presenti due volte con lo stesso identico valore, concentrate su due momenti
precisi: un batch riemesso a monte, non due misurazioni diverse. Non le avevo
viste durante l'esplorazione: le ha trovate la primary key
`(idsensore, measured_at)`, che le ha rifiutate al primo caricamento. Senza
quel vincolo sarebbero entrate in silenzio e ogni media le avrebbe contate due
volte. Le scarto nell'ingest e il vincolo lo lascio dov'è, visto che è quello
che le ha scoperte. Se invece due righe con la stessa chiave avessero valori
diversi, l'ingest si ferma con un errore: scegliere quale tenere vorrebbe dire
inventare un dato.

**Il limite PM2.5 non è calcolabile qui.** È una media annuale di 25 µg/m³, ma
il dataset copre sei mesi (26 febbraio – 27 agosto). Restituire lo stesso un
numero sarebbe stato  sbagliato: chi lo legge lo prende per un dato di
legge. L'applicazione dice apertamente che non è calcolabile e spiega perché,
sia nella pagina sia nelle risposte dell'assistente.

Sui tre inquinanti calcolabili, su tutto il periodo: 103 superamenti PM10 su
1.928 rilevazioni (Milano 33, Monza 20), 327 per l'ozono su 33.468 (Monza 221),
nessuno per NO2, che si ferma a un massimo di 147,6 contro un limite di 200.

## L'assistente

Il modello non vede il database e non scrive SQL. Sceglie solo quale strumento
chiamare e con quali argomenti; i numeri tornano dal dominio e il modello si
limita a metterli in frasi.

Gli strumenti sono cinque: `get_metadata`, `get_exceedances`, `get_trend`,
`get_comune_summary`, `get_stations`.

Ho scartato l'alternativa più ovvia, cioè far generare l'SQL al modello. Su un
dataset piccolo funziona quasi sempre, ed è proprio questo il problema: quando
sbaglia produce un numero plausibile invece di un errore, e chi legge non ha
modo di accorgersene. Con strumenti tipizzati lo spazio di quello che può
succedere è chiuso, gli argomenti non validi vengono rifiutati e rimandati
indietro al modello perché si corregga, e sotto ogni risposta la pagina mostra
quali strumenti sono stati usati.

Ci sono anche due conseguenze pratiche. Il costo per domanda resta costante,
perché nel contesto non entrano mai i dati ma solo il risultato
dell'aggregazione. E per aggiungere una capacità basta aggiungere una voce in
`tools.ts` più una funzione nel dominio: non cambia nient'altro.

**Il modello è una variabile d'ambiente** (`LLM_MODEL`), non una costante nel
codice. Mentre lavoravo, il modello che avevo scelto
è stato ritirato dal fornitore. Sostituirlo ha richiesto una riga nel `.env` e
zero modifiche al codice. Per lo stesso motivo il ciclo di tool calling è
scritto con un semplice `fetch` : sono una
ventina di righe e non legano il progetto a nessuno.

## Verifica

I test in `tests/` coprono la logica pura: i limiti, le basi temporali, il caso
non calcolabile, la validazione degli argomenti che arrivano dal modello. Non
serve il database per eseguirli.

Per le aggregazioni SQL ho preso un'altra strada. `ingest/verify.py` rifà gli
stessi conti con pandas, direttamente dai CSV, senza toccare il database. Se le
due strade danno numeri diversi, una delle due ha un errore. È il controllo che
mi interessava davvero, perché un errore di aggregazione non si vede: il
risultato ha sempre l'aria di essere giusto.

Lo script applica la stessa deduplicazione dell'ingest, altrimenti i due
percorsi non sarebbero confrontabili e resterebbero distanti di quelle 12 righe.

## Cosa non ho costruito, e perché

**Il frontend è volutamente minimale.** Filtri, una tabella, un grafico. Il
grafico l'ho scritto in SVG a mano invece di aggiungere una libreria: l'unica
cosa che deve fare bene è mettere il limite di legge sullo stesso asse dei dati,
ed è una linea tratteggiata. Il tempo l'ho messo sul percorso dal dato grezzo
alla risposta corretta, che è dove un errore non si nota e falsa tutto il resto.


**mappa.** Le coordinate sono già nel database e la tabella `sensors` è
pronta, ma su quattordici comuni una mappa avrebbe raccontato meno di una
tabella ordinata per numero di superamenti.

**Nessuna soglia oltre le quattro dichiarate.** Le normative sulla qualità
dell'aria hanno più indicatori di questi, comprese le soglie giornaliere OMS che
sono più severe di quelle UE. Quali usare è una decisione di dominio, non
tecnica, e non mi sembrava una cosa da decidere da sola.

**Il periodo di default è tutto il dataset.** Non c'è un concetto di "ultimi
trenta giorni" perché i dati si fermano ad agosto 2026 e un default relativo a
oggi darebbe una pagina vuota.

## Dipendenze

Next.js e React sono alle versioni con le patch di sicurezza di dicembre 2025
(15.5.25 e 19.1.9): il progetto era partito da una versione poi risultata
vulnerabile, e l'ho aggiornata durante lo sviluppo.

`npm audit` segnala ancora `postcss`, che arriva come dipendenza transitiva di
Next.js. Le segnalazioni riguardano la generazione di CSS e il caricamento
automatico delle source map, quindi valgono quando si elabora CSS proveniente
da fonti non fidate: qui il progetto ha un unico foglio di stile statico e non
esiste quel percorso.Quindi nessun pericolo. 
Nella linea 15.x non c'è ancora una versione corretta e
l'unica alternativa sarebbe Next 16, un major con modifiche incompatibili: su
un prototipo mi sembra un rischio maggiore del problema che risolve.

## Uso di AI

Ho lavorato con un assistente AI per l'esplorazione iniziale del dataset e per
scrivere il codice. Le decisioni che ho descritto qui : lo schema, il punto in
cui scartare i dati non validi, il tool calling al posto del text-to-SQL, la
rinuncia all'ORM e alla libreria di grafici, la scelta di lasciare aperto
l'avviso su postcss sono mie, e sono le stesse che avevo descritto via email
prima di cominciare a scrivere.
