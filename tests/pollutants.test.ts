import { describe, expect, it } from "vitest";
import {
  POLLUTANTS,
  POLLUTANT_KEYS,
  comparisonMode,
  isPollutantKey,
  notComputableReason,
} from "../src/lib/pollutants";

describe("pollutant configuration", () => {
  it("uses the sensor type strings that appear in the source data", () => {
    // If ARPA renames a sensor type, every query silently returns zero rows.
    // This test is what makes that break loudly instead.
    expect(POLLUTANTS.PM10.sensorType).toBe("PM10 (SM2005)");
    expect(POLLUTANTS["PM2.5"].sensorType).toBe("Particelle sospese PM2.5");
    expect(POLLUTANTS.NO2.sensorType).toBe("Biossido di Azoto");
    expect(POLLUTANTS.O3.sensorType).toBe("Ozono");
  });

  it("compares directly only when limit and data share a time base", () => {
    // PM10: daily limit, daily data.
    expect(comparisonMode(POLLUTANTS.PM10)).toBe("direct");
    // NO2 and ozone: hourly limit, hourly data.
    expect(comparisonMode(POLLUTANTS.NO2)).toBe("direct");
    expect(comparisonMode(POLLUTANTS.O3)).toBe("direct");
  });

  it("refuses to compute the PM2.5 annual limit on six months of data", () => {
    expect(comparisonMode(POLLUTANTS["PM2.5"])).toBe("not-computable");
    expect(notComputableReason(POLLUTANTS["PM2.5"])).toMatch(/annuale/);
  });

  it("gives no reason for pollutants that are computable", () => {
    expect(notComputableReason(POLLUTANTS.PM10)).toBeNull();
  });

  it("rejects unknown pollutant keys coming from the model or the URL", () => {
    expect(isPollutantKey("PM10")).toBe(true);
    expect(isPollutantKey("SO2")).toBe(false);
    expect(isPollutantKey("")).toBe(false);
  });

  it("keeps every key consistent with its own entry", () => {
    for (const k of POLLUTANT_KEYS) expect(POLLUTANTS[k].key).toBe(k);
  });
});
