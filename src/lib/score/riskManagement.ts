/**
 * LAYER 3 — Risk management (a filter applied AFTER the score, never mixed
 * into it).
 *
 * This module cannot change the score and does not receive it as an input
 * it can weight — it only reads the level to phrase its suggestion. The
 * separation is the point: the research doc's section 4 carries the
 * strongest data in the whole compilation (BIS: ~75% of retail Bitcoin
 * buyers lost money; AMF: 89%+ of CFD clients lost, average loss €10,887;
 * Barber et al.: 80%+ of Taiwanese day traders lost money over a typical
 * semester), and what separates survivors is risk discipline rather than
 * signal sophistication. So position sizing must never be something a
 * high score can talk you out of.
 */

/** Risk per trade, as a % of total capital. The 1-2% band is the standard
 * money-management guideline (Van Tharp, Elder) and is where a fractional
 * Kelly (¼ to ½ of full Kelly) empirically lands for typical win rate and
 * payoff — see docs/pesquisa-score-oportunidade.md, section 4. */
export const MIN_RISK_PER_TRADE_PCT = 1;
export const MAX_RISK_PER_TRADE_PCT = 2;

/** Minimum reward-to-risk before an entry is worth considering. At 1:2 the
 * break-even win rate is 1/(1+2) = 33.3%; Binance's own guidance cites 1:3
 * as a reference. */
export const MIN_REWARD_RISK_RATIO = 2;

/**
 * Always rendered in full, never behind a tooltip or an expander. This is
 * product scope, not a legal footnote: the numbers in it are the most
 * robust findings in the research and they come from a central bank and
 * financial regulators, not from blogs.
 */
export const RISK_DISCLAIMER =
  "A maioria dos traders de varejo perde dinheiro no longo prazo. Um estudo do BIS (Bank for International Settlements) com dados de 95 países concluiu que cerca de 75% dos compradores de varejo de Bitcoin perderam dinheiro, com perda média de 47,89% do valor investido e prejuízos mais severos em mercados emergentes, incluindo o Brasil. Reguladores europeus (ESMA/AMF) reportam de 74% a 89% de contas de varejo perdedoras em CFDs. Este score é uma ferramenta de análise, não recomendação de investimento, e desempenho passado não garante resultado futuro.";

export interface RiskGuidance {
  /** Suggested risk per trade, % of total capital. */
  riskPerTradePct: number;
  riskRangePct: { min: number; max: number };
  /** Minimum reward:risk to require before entering. */
  minRewardRiskRatio: number;
  /** Win rate needed just to break even at that ratio, as a %. */
  breakevenWinRatePct: number;
  /** Position size in currency, when the caller supplies enough to compute
   * it; null when it can't be derived from the inputs given. */
  positionSize: PositionSize | null;
  disclaimer: string;
  notes: string[];
}

export interface PositionSize {
  /** Capital put at risk, in account currency. */
  riskAmount: number;
  /** Notional size of the position, in account currency. */
  positionValue: number;
  /** Units of the asset. */
  units: number;
  /** Distance from entry to stop, as a % of entry. */
  stopDistancePct: number;
}

export interface RiskGuidanceInput {
  /** Total account capital. Optional — without it only the percentages and
   * the disclaimer can be returned. */
  capital?: number | null;
  entryPrice?: number | null;
  stopPrice?: number | null;
  /** Overrides the default risk %, still clamped to the 1-2% band. */
  riskPerTradePct?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Position size derived from the stop distance, which is the only correct
 * way round: you decide what you're willing to lose, the stop tells you how
 * far away "wrong" is, and those two together dictate the size. Sizing
 * first and placing the stop afterwards is how accounts die.
 */
export function calculatePositionSize(
  capital: number,
  entryPrice: number,
  stopPrice: number,
  riskPerTradePct: number,
): PositionSize | null {
  if (!(capital > 0) || !(entryPrice > 0) || !(stopPrice > 0)) return null;
  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (stopDistance === 0) return null;

  const riskAmount = capital * (riskPerTradePct / 100);
  const units = riskAmount / stopDistance;
  return {
    riskAmount,
    positionValue: units * entryPrice,
    units,
    stopDistancePct: (stopDistance / entryPrice) * 100,
  };
}

/**
 * The whole of Layer 3. Note what it does NOT do: it never takes the score
 * as a multiplier, so a 95 cannot argue its way into a bigger position than
 * a 65. Conviction belongs in whether you take the trade at all, not in how
 * much of the account you bet on it.
 */
export function sugerirGestaoDeRisco(input: RiskGuidanceInput = {}): RiskGuidance {
  const riskPerTradePct = clamp(
    input.riskPerTradePct ?? MIN_RISK_PER_TRADE_PCT,
    MIN_RISK_PER_TRADE_PCT,
    MAX_RISK_PER_TRADE_PCT,
  );

  const positionSize =
    input.capital != null && input.entryPrice != null && input.stopPrice != null
      ? calculatePositionSize(input.capital, input.entryPrice, input.stopPrice, riskPerTradePct)
      : null;

  const notes = [
    `Arrisque no máximo ${MIN_RISK_PER_TRADE_PCT}-${MAX_RISK_PER_TRADE_PCT}% do capital por operação, calculado a partir da distância até o stop.`,
    `Exija pelo menos ${MIN_REWARD_RISK_RATIO}:1 de retorno sobre risco — a ${MIN_REWARD_RISK_RATIO}:1 você precisa acertar ${breakevenWinRate(MIN_REWARD_RISK_RATIO).toFixed(1)}% das vezes só para empatar.`,
    "Defina o stop pelo setup técnico (estrutura de preço ou ATR) antes de dimensionar a posição, nunca o contrário.",
    "O tamanho da posição não aumenta com a nota do score: convicção decide se você entra, não quanto da conta você aposta.",
  ];

  return {
    riskPerTradePct,
    riskRangePct: { min: MIN_RISK_PER_TRADE_PCT, max: MAX_RISK_PER_TRADE_PCT },
    minRewardRiskRatio: MIN_REWARD_RISK_RATIO,
    breakevenWinRatePct: breakevenWinRate(MIN_REWARD_RISK_RATIO),
    positionSize,
    disclaimer: RISK_DISCLAIMER,
    notes,
  };
}

/** Break-even win rate for a reward:risk of 1:N — the standard 1/(1+N). */
export function breakevenWinRate(rewardRiskRatio: number): number {
  if (rewardRiskRatio <= 0) return 100;
  return (1 / (1 + rewardRiskRatio)) * 100;
}
