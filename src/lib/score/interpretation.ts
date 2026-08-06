import type { ScoreLevel } from "../../components/common";
import type { MarketRegime } from "./config";

/**
 * The reading: what the score MEANS given the regime the market is in.
 *
 * A second label alongside the number, in the same spirit as confluence
 * (Layer 2) — it reads the score's output and never feeds back into it. The
 * number stays the number; this only says how much to trust it right now.
 *
 * Why it exists at all: this score is contrarian in every group. RSI and
 * Bollinger read mean-reversion, MVRV reads overvaluation, Fear & Greed
 * reads contrarian. That is a system built to buy weakness — which is
 * exactly right in a market going sideways, and exactly how you catch a
 * falling knife in a downtrend. The regime is the difference between those
 * two situations, and the score alone cannot tell them apart.
 *
 * So the product answers three questions, not one:
 *   - is this a buying opportunity?
 *   - is this a selling opportunity?
 *   - or is the market simply going sideways?
 *
 * IMPORTANT about the third one: regime detection (ADX + long-MA slope)
 * describes the market's CURRENT state. It does not forecast that price
 * will start ranging. "Lateral" here means "is ranging now", and the copy
 * has to say that, because the honest claim is much weaker than a
 * prediction and pretending otherwise would be the exact kind of invented
 * precision the rest of this module set refuses to ship.
 */

/** What the user should actually take away. */
export type ReadingAction =
  /** Score says buy and the regime does not argue against it. */
  | "buy"
  /** Score says sell and the regime does not argue against it. */
  | "sell"
  /** A directional signal the regime undermines — the falling-knife case. */
  | "caution"
  /** No directional edge: score near neutral, or not enough to judge. */
  | "wait";

export interface Reading {
  action: ReadingAction;
  /** Short badge text. */
  label: string;
  /** One sentence explaining the combination. */
  detail: string;
  /** True when the regime actively contradicts the score's direction. */
  regimeConflict: boolean;
}

const BULLISH_LEVELS: ScoreLevel[] = ["buy", "strongBuy"];
const BEARISH_LEVELS: ScoreLevel[] = ["sell", "strongSell"];

/**
 * Combines the score's level with the market regime.
 *
 * Pure and total: every (level, regime) pair returns something, so the UI
 * never has to handle a gap.
 */
export function interpretReading(level: ScoreLevel, regime: MarketRegime): Reading {
  const bullish = BULLISH_LEVELS.includes(level);
  const bearish = BEARISH_LEVELS.includes(level);

  // Neutral score: the regime decides whether that is "nothing happening"
  // or "genuinely ranging", which are different messages to the user.
  if (!bullish && !bearish) {
    if (regime === "range") {
      return {
        action: "wait",
        label: "Lateral",
        detail:
          "Mercado sem tendência definida e score no meio da faixa — nada a fazer, mas é o terreno em que este score costuma funcionar melhor quando ele se mexer.",
        regimeConflict: false,
      };
    }
    return {
      action: "wait",
      label: "Sem sinal",
      detail: "Score no meio da faixa — nenhuma ponta de compra ou venda clara agora.",
      regimeConflict: false,
    };
  }

  // A contrarian buy into a confirmed downtrend is the single most
  // expensive mistake this system can make, so it gets named outright.
  if (bullish && regime === "downtrend") {
    return {
      action: "caution",
      label: "Compra contra a tendência",
      detail:
        "O score aponta compra, mas o mercado está em tendência de baixa confirmada. Este score compra fraqueza — em queda sustentada isso é faca caindo. Exija mais convicção ou espere a tendência virar.",
      regimeConflict: true,
    };
  }

  if (bearish && regime === "uptrend") {
    return {
      action: "caution",
      label: "Venda contra a tendência",
      detail:
        "O score aponta venda, mas o mercado está em tendência de alta confirmada. Vender sobrecompra numa alta forte costuma ser cedo demais.",
      regimeConflict: true,
    };
  }

  // Mean reversion is at its most reliable exactly where price has no
  // trend to fight.
  if (regime === "range") {
    return bullish
      ? {
          action: "buy",
          label: "Compra em lateralização",
          detail:
            "Score aponta compra e o mercado está lateral — é o cenário mais favorável para um score de reversão à média, porque o preço tende a voltar para o meio da faixa.",
          regimeConflict: false,
        }
      : {
          action: "sell",
          label: "Venda em lateralização",
          detail:
            "Score aponta venda e o mercado está lateral — topo de faixa num mercado sem tendência é o cenário clássico de reversão.",
          regimeConflict: false,
        };
  }

  if (bullish) {
    return {
      action: "buy",
      label: regime === "uptrend" ? "Compra a favor da tendência" : "Compra",
      detail:
        regime === "uptrend"
          ? "Score aponta compra e o mercado está em tendência de alta — correção dentro de alta, o pullback que o score procura."
          : "Score aponta compra. Sem histórico suficiente para classificar o regime, então a leitura vem só do score.",
      regimeConflict: false,
    };
  }

  return {
    action: "sell",
    label: regime === "downtrend" ? "Venda a favor da tendência" : "Venda",
    detail:
      regime === "downtrend"
        ? "Score aponta venda e o mercado está em tendência de baixa — repique dentro de queda."
        : "Score aponta venda. Sem histórico suficiente para classificar o regime, então a leitura vem só do score.",
    regimeConflict: false,
  };
}
