-- Schema per monitoraggio
--
-- 2 tabelle: sensori -> one row per sensor, con la stazione e le misure.

DROP TABLE IF EXISTS measurements;
DROP TABLE IF EXISTS sensors;

CREATE TABLE sensors (
    idsensore        INTEGER PRIMARY KEY,
    pollutant        TEXT    NOT NULL,   -- nometiposensore, es: 'PM10 (SM2005)'
    unit             TEXT    NOT NULL,   -- unita_misura
    idstazione       INTEGER NOT NULL,
    station_name     TEXT    NOT NULL,   -- nomestazione
    comune           TEXT    NOT NULL,
    provincia        TEXT    NOT NULL,
    lat              DOUBLE PRECISION,
    lng              DOUBLE PRECISION
);

CREATE TABLE measurements (
    idsensore        INTEGER NOT NULL REFERENCES sensors(idsensore), --ref esterna
    measured_at      TIMESTAMP NOT NULL,
    value            DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (idsensore, measured_at)
);

-- ogni query nell'app e' filtrata  per pollutant + comune + time range

CREATE INDEX idx_measurements_time    ON measurements (measured_at);
CREATE INDEX idx_sensors_pollutant    ON sensors (pollutant, comune);
