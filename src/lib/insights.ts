export interface InsightSignal {
  text: string;
  bias: "bullish" | "bearish" | "neutral";
}

export interface TradeInsightsResult {
  bias: "bullish" | "bearish" | "neutral";
  signals: InsightSignal[];
}

interface BuildInsightsInput {
  symbol: string;
  rsi: number | null;
  bbPosition: "above-upper" | "below-lower" | "inside" | null;
  fundingRate: number | null;
  longShortRatio: number | null;
  fearGreedValue: number | null;
  fearGreedLabel: string | null;
}

export function buildTradeInsights(input: BuildInsightsInput): TradeInsightsResult {
  const signals: InsightSignal[] = [];

  if (input.rsi !== null) {
    if (input.rsi <= 30) {
      signals.push({
        bias: "bullish",
        text: `RSI em ${input.rsi.toFixed(0)} indica sobrevenda — zona historicamente associada a possíveis fundos ou reversões de alta.`,
      });
    } else if (input.rsi >= 70) {
      signals.push({
        bias: "bearish",
        text: `RSI em ${input.rsi.toFixed(0)} indica sobrecompra — risco maior de correção de curto prazo.`,
      });
    }
  }

  if (input.bbPosition === "above-upper") {
    signals.push({
      bias: "bearish",
      text: "Preço rompeu a banda superior de Bollinger — movimento esticado, pode haver reversão à média.",
    });
  } else if (input.bbPosition === "below-lower") {
    signals.push({
      bias: "bullish",
      text: "Preço abaixo da banda inferior de Bollinger — possível sobrevenda técnica.",
    });
  }

  if (input.fundingRate !== null) {
    const pct = input.fundingRate * 100;
    if (input.fundingRate >= 0.0005) {
      signals.push({
        bias: "bearish",
        text: `Funding rate positivo e elevado (${pct.toFixed(3)}%) — mercado pagando caro para manter posições long, sinal de alavancagem excessiva no lado comprado.`,
      });
    } else if (input.fundingRate <= -0.0005) {
      signals.push({
        bias: "bullish",
        text: `Funding rate negativo (${pct.toFixed(3)}%) — pressão vendedora alavancada, cenário que historicamente pode preceder um short squeeze.`,
      });
    }
  }

  if (input.longShortRatio !== null) {
    if (input.longShortRatio >= 1.5) {
      signals.push({
        bias: "bearish",
        text: `Muito mais contas long que short (ratio ${input.longShortRatio.toFixed(2)}) — posicionamento otimista extremo, risco de liquidações em cascata em quedas.`,
      });
    } else if (input.longShortRatio <= 0.7) {
      signals.push({
        bias: "bullish",
        text: `Mais contas short que long (ratio ${input.longShortRatio.toFixed(2)}) — pessimismo predominante entre traders de futuros.`,
      });
    }
  }

  if (input.fearGreedValue !== null && input.fearGreedLabel) {
    if (input.fearGreedValue <= 24) {
      signals.push({
        bias: "bullish",
        text: `Índice de Medo & Ganância em ${input.fearGreedValue} (${input.fearGreedLabel}) — sentimento extremamente pessimista, contrarians veem como oportunidade.`,
      });
    } else if (input.fearGreedValue >= 75) {
      signals.push({
        bias: "bearish",
        text: `Índice de Medo & Ganância em ${input.fearGreedValue} (${input.fearGreedLabel}) — euforia no mercado, historicamente zona de cautela.`,
      });
    }
  }

  const bullishCount = signals.filter((s) => s.bias === "bullish").length;
  const bearishCount = signals.filter((s) => s.bias === "bearish").length;
  const bias =
    bullishCount > bearishCount ? "bullish" : bearishCount > bullishCount ? "bearish" : "neutral";

  return { bias, signals };
}
