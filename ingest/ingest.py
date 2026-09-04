"""
legge i csv, li pulisce e li confronta con i dati nel db, per vedere se ci sono discrepanze.

I record invalidi vengono scartati qui, prima di inserire i dati nel database

Run once:  python ingest/ingest.py

"""

import csv
import io   #gestisce stringhe come file in memoria
import os
import sys  #per chiudere lo script con sys.exit
from datetime import datetime   #per convertire le date in oggetti datetime

import psycopg2     #per postgres

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
SCHEMA = os.path.join(os.path.dirname(__file__), "..", "db", "schema.sql")  #struttura del db
DSN = os.environ.get(
    "DATABASE_URL", "postgresql://aq:aq@localhost:5432/airquality"
) # controllo per vedere se esiste una variabile d'ambiente DATABASE_URL, altrimenti uso il default
    # potro' cambiare il db senza toccare il codice, basta cambiare la variabile d'ambiente DATABASE_URL

# ARPA segnala i valori mancanti con 'NA' nello stato e -9999.0 nel valore.
MISSING_STATE = "NA"
MISSING_VALUE = -9999.0


# leggo stations.csv e restituisco una lista di tuple, una per riga, con i valori convertiti al tipo giusto.
def read_stations():
    """una riga per sensore, joined con le stazioni."""
    path = os.path.join(DATA_DIR, "stations.csv")
    rows = []
    with open(path, newline="", encoding="utf-8") as f: #utf-8" garantisce che Python legga e scriva correttamente i caratteri senza perdere informazioni.
        for r in csv.DictReader(f): #legge ogni riga
            rows.append(
                (
                    int(r["idsensore"]),
                    r["nometiposensore"].strip(), #.strip() rimuove spazi bianchi 
                    r["unitamisura"].strip(),
                    int(r["idstazione"]),
                    r["nomestazione"].strip(),
                    r["comune"].strip(),
                    r["provincia"].strip(),
                    float(r["lat"]) if r.get("lat") else None,
                    float(r["lng"]) if r.get("lng") else None,
                )
            )
    return rows


def read_measurements():
    """
    Restituisce solo le letture valide, senza duplicati.

    Note: i file csv sono stati letti con csv module invece di pandas perche'
    pandas converte automaticamente i valori 'NA' in NaN,
    e questo nasconde silenziosamente le righe che dobbiamo leggere.

    Il file di origine contiene alcune righe ripetute con la stessa coppia
    (idsensore, data). Sono ripetizioni esatte, con lo stesso valore quindi probabilmente un batch
    riemesso a monte, non due misurazioni diverse. Le scarto qui, come i valori
    mancanti, cosi' la primary key del database resta una garanzia vera e
    nessuna media conta due volte la stessa lettura.
    """
    path = os.path.join(DATA_DIR, "measurements.csv")
    kept, dropped, duplicated = 0, 0, 0
    seen = {}          # (idsensore, data) -> valore gia' accettato
    conflicts = []     # stessa chiave, valore diverso: non e' un duplicato
    rows = []

    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            state = (r.get("stato") or "").strip()
            value = float(r["valore"])
            if state == MISSING_STATE or value == MISSING_VALUE:
                dropped += 1
                continue

            sensor = int(r["idsensore"])
            when = datetime.fromisoformat(r["data"].strip())
            key = (sensor, when)

            if key in seen:
                if seen[key] == value:
                    duplicated += 1
                else:
                    conflicts.append((key, seen[key], value))
                continue

            seen[key] = value
            rows.append((sensor, when, value))
            kept += 1

    if conflicts:
        # Due valori diversi per lo stesso sensore nello stesso istante non
        # sono un duplicato: scegliere da soli quale tenere significherebbe
        # inventare un dato. Meglio fermarsi.
        raise ValueError(
            f"{len(conflicts)} letture in conflitto, "
            f"prima: {conflicts[0]}"
        )

    return rows, kept, dropped, duplicated

#carico le righe nel db con copy_from, che e' molto piu' veloce di insert row by row.
def copy_into(cur, table, columns, rows):

    buf = io.StringIO() #creo una buffer
    w = csv.writer(buf, delimiter="\t", quoting=csv.QUOTE_MINIMAL)
    for row in rows:
        w.writerow(["\\N" if v is None else v for v in row])
    buf.seek(0)
    cur.copy_from(buf, table, columns=columns, null="\\N") #carica i dati nel db


def main():
    stations = read_stations()
    measurements, kept, dropped, duplicated = read_measurements()

    print(f"sensors      : {len(stations)}")
    print(f"measurements : {kept} valid, {dropped} invalid discarded, "
          f"{duplicated} duplicates removed")
          
    with psycopg2.connect(DSN) as conn: # Apro una connessione al DB usando la DSN definita (context manager).
        with conn.cursor() as cur:  # Apro un cursore DB nel contesto della connessione.
            with open(SCHEMA, encoding="utf-8") as f:
                cur.execute(f.read())   #esegue tutto il contenuto di schema.sql una volta. Quel file inizia con DROP TABLE IF EXISTS, quindi questa riga distrugge le tabelle precedenti.
            copy_into(
                cur,
                "sensors",
                ["idsensore", "pollutant", "unit", "idstazione",
                 "station_name", "comune", "provincia", "lat", "lng"],
                stations,
            )
            copy_into(
                cur,
                "measurements",
                ["idsensore", "measured_at", "value"],
                measurements,
            )
        conn.commit()

    print("done")


if __name__ == "__main__":
    sys.exit(main())
