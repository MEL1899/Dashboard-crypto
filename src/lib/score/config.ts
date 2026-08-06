/**
 * Single source of truth for how the opportunity score is calculated.
 *
 * Everything that decides a number lives here — group weights, metric
 * weights, clip ranges and, critically, each metric's *direction*. The
 * scoring functions read this config and the "Como esse score é calculado?"
 * panel is generated from this same object, so the documentation can never
 * drift from the math (see docs/pesquisa-score-oportunidade.md, section 3:
 * of the published composite indices only Alternative.me's Fear & Greed
 * discloses its exact weights).
 *
 * Nothing here is hardcoded at a call site on purpose: making weights vary
 * by market regime later should be a data change in this file, not a
 * rewrite of the scoring code.
 */

/** Normalized metric scale: 0 = extremely bearish, 50 = neutral, 100 =
 * extremely bullish. Every raw metric is mapped onto this before any
 * weighting happens (OECD Handbook on Composite Indicators, min-max). */
export const NEUTRAL = 50;
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

/**
 * Which way a raw metric points once normalized.
 *
 * - "direct": a higher raw value is more bullish (momentum/trend reading).
 * - "inverted": a higher raw value is more bearish (mean-reversion or
 *   contrarian reading — overbought, overvalued, crowded long).
 *
 * This is the single most consequential choice in the whole file and it is
 * NOT settled by the research: the same RSI is bullish-when-high to a
 * momentum trader and bearish-when-high to a mean-reversion trader. The
 * defaults below follow the studies the research doc actually cites (which
 * tested classic overbought/oversold thresholds) and the fact that this is
 * an *entry opportunity* score — an oversold asset is an opportunity, not a
 * warning. Flip any of these here to test the opposite convention.
 */
export type MetricDirection = "direct" | "inverted";

export interface MetricSpec {
  /** Stable id, also used as the key of the raw-value input. */
  id: string;
  label: string;
  /** Share of its group, 0-1. Weights within a group sum to 1. */
  weight: number;
  direction: MetricDirection;
  /** Raw values are clamped to [min, max] then linearly mapped to 0-100.
   * Ranges centred on the neutral point keep 50 meaningful. */
  clip: { min: number; max: number };
  /** Shown in the transparency panel so a user can audit the mapping. */
  rationale: string;
  unit?: string;
}

export interface GroupSpec {
  id: "technical" | "onchain" | "sentiment";
  label: string;
  /** Share of the final score, 0-1. Groups sum to 1. */
  weight: number;
  metrics: MetricSpec[];
}

/**
 * Technical group. Sub-weights follow the research doc's section 1: RSI
 * beat MACD in two independent studies (52.8% vs 46.7% hit rate, €22,800 vs
 * €900 simulated profit over the same 10 assets), and Bollinger Bands was
 * the best single indicator in two others (ETH Zürich thesis, Sharpe 3.2;
 * Freqtrade 2025 study, best of all strategies tested). MACD was the worst
 * performer in three separate studies, so it carries the smallest weight it
 * can while still contributing.
 */
const TECHNICAL: GroupSpec = {
  id: "technical",
  label: "Técnico",
  weight: 1 / 3,
  metrics: [
    {
      id: "rsi",
      label: "RSI multi-timeframe (1H/4H/1D)",
      weight: 0.35,
      // Mean-reversion reading: RSI 30 (oversold) is the buy opportunity,
      // RSI 70 (overbought) is the warning. This inverts the raw value.
      direction: "inverted",
      clip: { min: 0, max: 100 },
      rationale:
        "RSI já é nativo 0-100. Lido como sobrecompra/sobrevenda (o mesmo critério dos estudos citados): RSI baixo = oportunidade de compra. Os 3 timeframes entram com peso maior no mais longo, já que o RSI perdeu poder preditivo em timeframes curtos (Sharpe 5,13 no 4H vs -0,45 no 5min).",
    },
    {
      id: "bollingerPercentB",
      label: "Bollinger %b",
      weight: 0.35,
      // %b = 0 → price at the lower band (oversold), %b = 1 → upper band.
      direction: "inverted",
      clip: { min: 0, max: 1 },
      rationale:
        "%b posiciona o preço dentro das bandas: 0 = banda inferior, 1 = superior. Lido como reversão à média (preço na banda inferior = oportunidade), que é a leitura clássica das estratégias de BB testadas na tese da ETH Zürich.",
    },
    {
      id: "macdHistogram",
      label: "MACD (histograma)",
      weight: 0.15,
      // Momentum reading: a positive histogram is bullish momentum.
      direction: "direct",
      clip: { min: -1.5, max: 1.5 },
      unit: "% do preço",
      rationale:
        "Histograma normalizado como % do preço, para o valor não depender da escala do ativo. Peso baixo porque o MACD foi o pior indicador em três estudos independentes.",
    },
    {
      id: "emaDistance",
      label: "Distância da EMA longa",
      weight: 0.15,
      // Trend reading: price above the long EMA is an uptrend.
      direction: "direct",
      clip: { min: -10, max: 10 },
      unit: "%",
      rationale:
        "Distância percentual do preço até a EMA longa — mede tendência, não sobrecompra. Positivo = preço acima da média = tendência de alta.",
    },
  ],
};

/**
 * Funding rate at rest, in % per day.
 *
 * Binance's funding formula carries a fixed interest-rate term of 0.01% per
 * 8-hour window for USDT perpetuals, so 0.03%/day is what funding reads when
 * the market is saying nothing at all. It is the neutral point of the
 * metric, and the clip range has to be centred on it.
 *
 * This was a real calibration bug: with the range centred on zero, a
 * perfectly ordinary +0.03%/day normalized to 20/100 ("deeply bearish"),
 * and since the on-chain group is usually funding alone it dragged roughly
 * 12 points off every score, permanently, for no reason.
 */
export const FUNDING_NEUTRAL_PCT_PER_DAY = 0.03;
/**
 * Half-width of the funding clip range, in % per day. Kept at the original
 * 0.05 — only the CENTRE was wrong. The width itself is still uncalibrated
 * guesswork: it saturates at 0.08%/day, while a genuinely crowded market
 * reaches several times that. Narrowing or widening it needs measurement,
 * not another opinion.
 */
export const FUNDING_CLIP_HALF_WIDTH = 0.05;
/** 0.03 - 0.05 is -0.020000000000000004 in binary floating point, and the
 * transparency panel prints the clip bounds verbatim. Rounded to the
 * hundredth of a basis point, which is far finer than any funding rate. */
const roundFunding = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * On-chain group. v1 uses only the three metrics obtainable from free or
 * public APIs, at equal weight. SOPR, Puell Multiple and Reserve Risk are
 * defined in the research doc (section 2) and are the intended v2 additions
 * — adding one is a matter of appending a MetricSpec here and rebalancing
 * the weights.
 *
 * In practice only funding has a live source today: MVRV and exchange
 * netflow have no free feed. See signalScore.ts for why that does NOT leave
 * funding carrying the group's whole 1/3.
 */
const ONCHAIN: GroupSpec = {
  id: "onchain",
  label: "On-chain",
  weight: 1 / 3,
  metrics: [
    {
      id: "mvrvZScore",
      label: "MVRV Z-Score",
      weight: 1 / 3,
      // High Z-Score = market cap far above realized cap = the historical
      // top zone, so it reads bearish.
      direction: "inverted",
      clip: { min: -2, max: 8 },
      rationale:
        "Desvio estatístico do valuation. Clipado entre -2 e 8 e invertido: Z-Score alto é a zona de topo histórica (Glassnode), Z-Score perto de zero ou negativo é zona de fundo.",
    },
    {
      id: "fundingRate",
      label: "Funding Rate (perpétuos)",
      weight: 1 / 3,
      // Sustained positive funding = crowded long = top risk.
      direction: "inverted",
      // Centrado em FUNDING_NEUTRAL_PCT_PER_DAY, NÃO em zero — ver a
      // constante abaixo. Zero não é o repouso deste mercado.
      clip: {
        min: roundFunding(FUNDING_NEUTRAL_PCT_PER_DAY - FUNDING_CLIP_HALF_WIDTH),
        max: roundFunding(FUNDING_NEUTRAL_PCT_PER_DAY + FUNDING_CLIP_HALF_WIDTH),
      },
      unit: "% ao dia",
      rationale:
        "Invertido: funding acima do normal indica excesso de alavancagem comprada (risco de topo); abaixo, risco de short squeeze. A faixa é centrada em +0,03% ao dia, que é o funding de repouso da Binance (0,01% por janela de 8h), e não em zero — centrar em zero fazia um mercado perfeitamente normal pontuar 20/100. Atenção ao viés estrutural: a BitMEX mediu funding positivo em 92% do tempo.",
    },
    {
      id: "exchangeNetflow",
      label: "Exchange Netflow",
      weight: 1 / 3,
      // Coins flowing INTO exchanges = supply available to sell = bearish.
      direction: "inverted",
      clip: { min: -3, max: 3 },
      unit: "desvios vs. média 7d",
      rationale:
        "Normalizado pela variação relativa à média móvel de 7 dias, não pelo valor absoluto (a CryptoQuant trata a métrica como leitura relativa). Invertido: entrada líquida em exchanges = pressão vendedora.",
    },
  ],
};

/**
 * Sentiment group. v1 consumes Alternative.me's published index directly
 * and uses it as the entire group, per the research doc's finding that it
 * is the only major composite index disclosing exact weights (Volatilidade
 * 25%, Momentum/Volume 25%, Redes sociais 15%, Surveys 15%, Dominância BTC
 * 10%, Google Trends 10%). Re-implementing that formula ourselves only
 * makes sense if we later want to customize those weights.
 */
/*
 * TODO (só depois de validar com dado real no backtest): a inversão linear
 * do Fear & Greed provavelmente não é a curva ideal de mapeamento.
 *
 * Uma análise de mercado (NÃO é paper acadêmico — tratar como hipótese, não
 * como fato estabelecido) comparou retorno histórico por faixa do índice
 * separando Bitcoin de altcoins e encontrou um padrão que a inversão linear
 * não captura:
 *
 *   - Bitcoin teve os melhores retornos na faixa NEUTRA do índice, não em
 *     Medo Extremo. Sob inversão linear, medo extremo (F&G 5) vira nota 95
 *     — a nota mais alta possível — o que contraria esse achado.
 *   - Altcoins tiveram os melhores retornos em Ganância Extrema, ou seja,
 *     comportamento de momentum e não de reversão — sugerindo que a direção
 *     correta pode até depender da classe do ativo.
 *
 * Se o padrão se confirmar, o mapeamento certo pra BTC seria um U invertido
 * (neutro pontuando acima dos dois extremos) em vez de uma reta descendente,
 * e possivelmente uma direção diferente para altcoins. Implementar isso
 * exigiria trocar `direction` por uma função de mapeamento por métrica, o
 * que a estrutura atual comporta.
 *
 * NÃO implementar antes de medir: o harness em scripts/fng-direction-ab.ts
 * roda direto vs. invertido contra o baseline aleatório e é ele que deve
 * decidir, não o racional acima.
 *
 * Fonte: "How Crypto Investors Misinterpret Warren Buffett's Advice on Fear
 * and Greed" (CCN, análise de mercado)
 * https://www.ccn.com/analysis/business/warren-buffetts-fear-and-greed-strategy-in-crypto/
 */
const SENTIMENT: GroupSpec = {
  id: "sentiment",
  label: "Sentimento",
  weight: 1 / 3,
  metrics: [
    {
      id: "fearGreed",
      label: "Fear & Greed Index",
      weight: 1,
      // DECIDIDO POR RACIOCÍNIO, NÃO POR MEDIÇÃO: o A/B em
      // scripts/fng-direction-ab.ts existe e está pronto, mas foi
      // dispensado — nenhum dado histórico sustenta esta direção contra a
      // alternativa. Rodar `npm run ab:fng` ainda é a forma de conferir.
      //
      // Contrarian reading: extreme greed is the warning, extreme fear is
      // the opportunity. "Be greedy when others are fearful" is literally
      // why the index was created, and it lines sentiment up with the
      // mean-reversion direction already used by RSI, Bollinger and MVRV —
      // the whole score is a contrarian system, and reading sentiment as
      // momentum was the one piece that broke the pattern. Left as
      // "direct" it also produced a structural contradiction: at a
      // euphoric top the technical group read ~35 (sell) while sentiment
      // read 90 (buy), muting the score at exactly the moment it should
      // speak loudest.
      direction: "inverted",
      clip: { min: 0, max: 100 },
      rationale:
        "Índice pronto da Alternative.me (0 = medo extremo, 100 = ganância extrema), usado como o grupo inteiro na v1, com leitura contrária: ganância extrema vira nota baixa, medo extremo vira nota alta. É o único índice composto da indústria que publica componentes e pesos exatos.",
    },
  ],
};

export interface ScoreWeightConfig {
  groups: GroupSpec[];
  /** Weights applied to each RSI timeframe before they are combined into
   * the single `rsi` metric. Longer timeframes weigh more: the research doc
   * records the same RSI strategy at Sharpe 5.13 on 4H and -0.45 on 5min. */
  rsiTimeframeWeights: { "1h": number; "4h": number; "1d": number };
}

/**
 * Market regime the score is being computed under. The research doc
 * (section 1) shows Bollinger Bands performing oppositely in bear vs bull
 * markets, so group weights arguably should vary by regime.
 *
 * v1 deliberately does NOT vary them: every regime resolves to the same
 * config below. The plumbing exists so that turning it on later is a data
 * change in WEIGHTS_BY_REGIME, not a change to any scoring function.
 */
/*
 * FEITO: a detecção de regime existe (score/regime.ts, via ADX + inclinação
 * da média longa) e está ligada ao app — useWatchlistSignals a calcula e
 * score/interpretation.ts a usa para qualificar o score.
 *
 * O que ela NÃO faz, deliberadamente: mudar peso nenhum. O regime resolve o
 * risco de "faca caindo" avisando que uma compra é contra a tendência, e
 * isso é um rótulo. Mexer nos pesos por regime seria calibrar sem medição,
 * exatamente o que o resto deste arquivo evita — e os pesos por regime
 * continuam idênticos por isso.
 */
export type MarketRegime = "uptrend" | "downtrend" | "range" | "unknown";

const BASE_CONFIG: ScoreWeightConfig = {
  groups: [TECHNICAL, ONCHAIN, SENTIMENT],
  rsiTimeframeWeights: { "1h": 0.2, "4h": 0.3, "1d": 0.5 },
};

/** All regimes intentionally share one config in v1 — see MarketRegime. */
export const WEIGHTS_BY_REGIME: Record<MarketRegime, ScoreWeightConfig> = {
  uptrend: BASE_CONFIG,
  downtrend: BASE_CONFIG,
  range: BASE_CONFIG,
  unknown: BASE_CONFIG,
};

export function configForRegime(regime: MarketRegime = "unknown"): ScoreWeightConfig {
  return WEIGHTS_BY_REGIME[regime];
}

/**
 * Returns a copy of `config` with one metric's direction flipped, leaving
 * every weight untouched. Built for the Fear & Greed direct-vs-inverted A/B
 * (scripts/fng-direction-ab.ts): the two arms have to differ in exactly one
 * bit, or the comparison measures something other than the direction.
 */
export function withMetricDirection(
  config: ScoreWeightConfig,
  metricId: string,
  direction: MetricDirection,
): ScoreWeightConfig {
  return {
    ...config,
    groups: config.groups.map((group) => ({
      ...group,
      metrics: group.metrics.map((metric) =>
        metric.id === metricId ? { ...metric, direction } : metric,
      ),
    })),
  };
}

/** Confluence thresholds (Layer 2). A group above HIGH is read as bullish,
 * below LOW as bearish; agreement across all available groups is "high
 * confluence". These bounds match the buy/sell badge bands so the label
 * never contradicts the badge. */
export const CONFLUENCE_BULLISH_ABOVE = 60;
export const CONFLUENCE_BEARISH_BELOW = 40;
