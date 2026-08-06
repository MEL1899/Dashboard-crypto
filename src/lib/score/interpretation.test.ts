import { describe, expect, it } from "vitest";
import { interpretReading } from "./interpretation";
import type { MarketRegime } from "./config";
import type { ScoreLevel } from "../../components/common";

const ALL_LEVELS: ScoreLevel[] = ["strongSell", "sell", "neutral", "buy", "strongBuy"];
const ALL_REGIMES: MarketRegime[] = ["uptrend", "downtrend", "range", "unknown"];

describe("interpretReading", () => {
  it("answers every combination — the UI never has to handle a gap", () => {
    for (const level of ALL_LEVELS) {
      for (const regime of ALL_REGIMES) {
        const reading = interpretReading(level, regime);
        expect(reading.label.length).toBeGreaterThan(0);
        expect(reading.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it("refuses to call a buy in a confirmed downtrend", () => {
    // The single most expensive mistake a contrarian score can make: every
    // group reads mean-reversion, so it buys weakness — and weakness in a
    // sustained downtrend is a falling knife, not a dip.
    for (const level of ["buy", "strongBuy"] as ScoreLevel[]) {
      const reading = interpretReading(level, "downtrend");
      expect(reading.action).toBe("caution");
      expect(reading.regimeConflict).toBe(true);
      expect(reading.detail).toMatch(/faca caindo/i);
    }
  });

  it("refuses to call a sell in a confirmed uptrend", () => {
    for (const level of ["sell", "strongSell"] as ScoreLevel[]) {
      const reading = interpretReading(level, "uptrend");
      expect(reading.action).toBe("caution");
      expect(reading.regimeConflict).toBe(true);
    }
  });

  it("treats a range as the score's best terrain, not as a warning", () => {
    // Mean reversion works precisely where there is no trend to fight, so
    // a range must not be downgraded the way a hostile trend is.
    const buy = interpretReading("buy", "range");
    expect(buy.action).toBe("buy");
    expect(buy.regimeConflict).toBe(false);

    const sell = interpretReading("sell", "range");
    expect(sell.action).toBe("sell");
    expect(sell.regimeConflict).toBe(false);
  });

  it("distinguishes 'market is ranging' from 'nothing to see'", () => {
    // Both are "wait", but they are different messages: one says the market
    // has no trend right now, the other says the score simply has no read.
    const ranging = interpretReading("neutral", "range");
    const quiet = interpretReading("neutral", "unknown");
    expect(ranging.action).toBe("wait");
    expect(quiet.action).toBe("wait");
    expect(ranging.label).not.toBe(quiet.label);
  });

  it("passes a directional call through when the trend agrees with it", () => {
    expect(interpretReading("buy", "uptrend").action).toBe("buy");
    expect(interpretReading("sell", "downtrend").action).toBe("sell");
  });

  it("never invents a regime call when the regime is unknown", () => {
    for (const level of ALL_LEVELS) {
      const reading = interpretReading(level, "unknown");
      expect(reading.regimeConflict).toBe(false);
    }
  });

  it("only ever conflicts when the score is directional", () => {
    for (const regime of ALL_REGIMES) {
      expect(interpretReading("neutral", regime).regimeConflict).toBe(false);
    }
  });
});
