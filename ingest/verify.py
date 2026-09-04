"""
Test indipendente per controllare/ check i lavori restituiti con SQL:

faccio gli stesso calcoli dai file csv, senza toccare il db con pandas, se i valori matchanno tutto e' apposto altrimenti c'e un problema.

Run:  python ingest/verify.py
"""

import os # serve per interagire con il sis. op.

import pandas as pd

DATA = os.path.join(os.path.dirname(__file__), "..", "data")    # carica la cartella giusta per leggere i dati

LIMITS = {      #definisco i limiti di legge per i vari inquinanti
    "PM10 (SM2005)": 50,
    "Biossido di Azoto": 200,
    "Ozono": 180,
    # PM2.5 e' stata deliberatamente esclusa perche' il suo limite va calcolato 
    #come media annuale e nel db abbiamo solo i dati per 6 mesi
}


def main():
    # keep_default_na=False -> altrimenti i dati 'NA' in `stato`
    # diventano NaN e sara' difficile riconoscere le righe sbagliate.

    m = pd.read_csv(os.path.join(DATA, "measurements.csv"), keep_default_na=False) #con pandas apro i file in una DataFrame
    s = pd.read_csv(os.path.join(DATA, "stations.csv"))

    print(f"rows total   : {len(m)}")
    print(f"rows invalid : {(m.stato == 'NA').sum()}")

    m = m[m.stato == "VA"].copy() #coppio le righe di m con un stato valido

    # Stessa deduplicazione dell'ingest, altrimenti i due percorsi non sono
    # confrontabili: il database ha una primary key su (idsensore, data).
    before = len(m)
    m = m.drop_duplicates(subset=["idsensore", "data"])
    print(f"rows dup     : {before - len(m)}")
    
    m["valore"] = m.valore.astype(float)
    m["data"] = pd.to_datetime(m["data"])
    d = m.merge(s[["idsensore", "nometiposensore", "comune"]], on="idsensore")

    print("merged data:")
    print(f"rows valid   : {len(d)}")
    print(f"period       : {d.data.min().date()} .. {d.data.max().date()}\n")

    for sensor_type, limit in LIMITS.items():
        sub = d[d.nometiposensore == sensor_type]   #filtro i dati per tipo di sensore -> sub : sottodb
        over = sub[sub.valore > limit] #valori olre limite
        print(f"{sensor_type}  (limite {limit})")
        print(f"  rilevazioni : {len(sub)}")
        print(f"  superamenti : {len(over)}")   #nr righe sopralimite
        print(f"  massimo     : {sub.valore.max():.1f}")
        if len(over):
            per_comune = over.comune.value_counts()
            print("  per comune  : " + ", ".join(
                f"{c}={n}" for c, n in per_comune.items()
            ))
        print()


if __name__ == "__main__":
    main()
