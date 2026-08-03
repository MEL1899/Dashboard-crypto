# Métricas, Estudos e Diretrizes para um Score de Oportunidade de Trade em Cripto

> **Aviso importante:** este documento é uma compilação de pesquisa — não é aconselhamento financeiro nem recomendação de investimento. Desempenho passado (de indicadores, estratégias ou ativos) não garante resultado futuro. Os estudos citados variam em rigor metodológico: alguns são papers acadêmicos com revisão por pares, outros são backtests independentes ou conteúdo institucional de empresas de dados — indiquei o tipo de fonte em cada achado para você calibrar o quanto confiar em cada número. Onde não encontrei dado quantitativo publicado, deixei isso explícito em vez de estimar.

## Sumário executivo

Três achados atravessam praticamente toda a pesquisa e valem guiar o desenho do seu score:

Primeiro, nenhum indicador isolado — técnico ou on-chain — tem poder preditivo estável e documentado; o desempenho de RSI, MACD e Bollinger Bands muda drasticamente conforme o timeframe e o regime de mercado (bull, bear, acumulação), então um score sério precisa tratar "contexto de mercado" como uma variável, não ignorá-la. Segundo, entre os índices compostos já publicados na indústria (Fear & Greed, Galaxy Score etc.), só o Fear & Greed Index da Alternative.me divulga sua fórmula e pesos exatos — os demais são "caixa-preta" em maior ou menor grau, o que é um argumento a favor de você documentar a sua própria fórmula desde o início, como diferencial. Terceiro, os dados mais robustos sobre resultado de traders de varejo (tanto em cripto quanto em forex/CFD) mostram que a maioria perde dinheiro no longo prazo — o que reforça que a camada de gestão de risco (position sizing, stop-loss, relação risco/retorno) importa tanto quanto, ou mais do que, a qualidade do sinal de entrada em si.

---

## 1. Indicadores técnicos: o que os estudos publicados mostram

### RSI (Relative Strength Index)

Um estudo comparativo aplicado a 10 criptomoedas responsáveis por 75,29% da capitalização de mercado (Bitcoin, Ethereum, USD Coin, XRP, Binance USD, Dogecoin, Cardano, Solana, Polkadot, Avalanche), no período de setembro de 2020 a outubro de 2022, testou sinais de RSI com limiares clássicos de sobrecompra/sobrevenda. O RSI gerou 235 sinais (122 de compra, 113 de venda), com 124 bem-sucedidos — taxa de acerto de 52,8%. Numa simulação com USD 100.000 por sinal (stop de 10%), o RSI gerou lucro de €22.800, contra apenas €900 do MACD no mesmo período e universo de ativos — e foi lucrativo em 6 das 10 moedas testadas, contra 4 do MACD. Fonte (paper acadêmico): [A comparative study between RSI and MACD to predict opportunities in cryptocurrency market from 2020 to 2022 (ResearchGate)](https://www.researchgate.net/publication/377921778_a-comparative-study-between-rsi-and-macd-to-predict-opportunities-in-cryptocurrency-market-from-2020-to-2022_1).

Um backtest independente (não acadêmico) de cruzamento de RSI nos limiares clássicos 30/70 em BTC/USDT, com stop-loss/take-profit de 1%/2%, mostrou desempenho extremamente sensível ao timeframe no mesmo ativo e período: no gráfico de 4 horas, 25 trades, 60% de acerto, lucro de US$ 1.784 sobre US$ 10.000, Sharpe de 5,13; no gráfico de 5 minutos, apenas 34,7% de acerto, prejuízo de US$ 9.386, drawdown de -111%, Sharpe de -0,45. Conclusão do autor: RSI funciona melhor em timeframes mais altos — em timeframes curtos o ruído destrói a vantagem estatística. Fonte (backtest independente, não peer-reviewed): [I Backtested RSI Crossovers on Bitcoin (Medium)](https://medium.com/@AtomicScript/episode-3-rsi-crossover-strategy-1273d8b3f290).

Sobre limiares alternativos (20/80 em vez de 30/70, mais comuns em conteúdo educacional voltado a cripto por causa da volatilidade mais alta): não encontrei nenhum backtest publicado que compare 20/80 contra 30/70 com números concretos — trate isso como heurística de mercado difundida, não achado empírico comprovado.

### MACD

No mesmo estudo comparativo (10 criptoativos, 2020–2022), o MACD teve desempenho inferior ao RSI: taxa de acerto de 46,7% (126 de 270 sinais) e lucro simulado de apenas €900, contra €22.800 do RSI. Fonte: mesmo paper acima.

Num estudo mais recente com múltiplas estratégias algorítmicas (BTC/ETH/XRP/SOL/ADA, jan–abr 2025, plataforma Freqtrade), uma estratégia baseada puramente em MACD teve o pior resultado entre todas as testadas: -3,33% de retorno, Sharpe de -16,86. Fonte (capstone acadêmico): [Review and Applications of Cryptocurrency Algorithmic Trading Strategies (American University of Armenia, 2025)](https://cse.aua.am/wp-content/uploads/2025/06/Capstone-final.pdf).

Numa tese de mestrado da ETH Zürich que testou MACD, cruzamentos de médias móveis, rompimento de canal e Bollinger Bands em Bitcoin (2013–2019), o MACD teve "desempenho moderado" e não foi escolhido para a estratégia final, superado claramente por Bollinger Bands. Fonte: [Backtesting of Trading Strategies for Bitcoin (ETH Zürich, Master Thesis, 2019)](https://ethz.ch/content/dam/ethz/special-interest/mtec/chair-of-entrepreneurial-risks-dam/documents/dissertation/master%20thesis/Master_Thesis_Gl%C3%BCcksmann_13June2019.pdf).

### Bandas de Bollinger

Na tese da ETH Zürich citada acima, Bollinger Bands foi o indicador de melhor desempenho entre os testados e virou a base da estratégia final. A versão básica "BB + confirmação de volume" (2015–2018) teve Sharpe acima de 3,0, retorno de ~7.800% no período in-sample e drawdown máximo de ~25% (contra 85% do buy-and-hold). A versão final aprimorada, testada em 2013–2019, teve Sharpe de 3,2 e drawdown de 25%, contra Sharpe de 1,13 do buy-and-hold no mesmo período.

No estudo de 2025 com Freqtrade (BTC/ETH/XRP/SOL/ADA), a estratégia baseada em Bollinger Bands ("BinHV45") foi a melhor de todas: 93,8% de acerto em 16 trades, Sharpe de 1,84, drawdown de apenas 0,05% — mas o lucro absoluto no período de 4 meses testado foi marginal (+0,13%), o que os próprios autores destacam como evidência de que estratégias técnicas puras controlam bem o risco, mas não necessariamente geram retorno expressivo isolado.

Um paper no SSRN testou breakout vs. reversão à média com Bollinger Bands em BTC/USDT (2017–2022) em quatro regimes de mercado distintos e concluiu que não há superioridade universal de uma abordagem sobre a outra — depende do regime (bear, acumulação, bull run, distribuição). Fonte: [Bollinger Bands under Varying Market Regimes (SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5775962).

### Médias móveis (SMA/EMA) e Golden/Death Cross

Um backtest independente testou cruzamentos de SMA em Bitcoin variando períodos curtos (10–110) e longos (20–210) entre julho e novembro de 2020. A melhor combinação (SMA 15/150) rendeu +97,9% partindo de US$ 10.000 — mas ficou abaixo do buy-and-hold no mesmo período (+115,9%), com exposição de mercado de apenas 54% do tempo. Fonte: [Finding the Best Moving Average Crossover Strategy for Bitcoin (Medium)](https://medium.com/chainslayer/finding-the-best-moving-average-crossover-strategy-for-bitcoin-f0a959b846c7). Não encontrei dados quantitativos verificáveis especificamente sobre golden cross/death cross em Bitcoin (as fontes mais promissoras estavam bloqueadas para acesso automatizado nesta pesquisa).

### Estudos comparativos e com machine learning

Um paper no SSRN (Spyros Papathanasiou) testou nove indicadores técnicos em Bitcoin de 2010 a 2021 com metodologia de bootstrap sob modelo GARCH(1,1) — estatisticamente mais rigorosa que um backtest simples — e concluiu que estratégias baseadas em indicadores técnicos superam significativamente o buy-and-hold, contrariando a hipótese de mercado eficiente para Bitcoin (números por indicador não estavam disponíveis no resumo acessado). Fonte: [Can Technical Analysis Generate Superior Returns in the Cryptocurrency Ecosystem? (SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4332884).

Um paper no arXiv usou RSI (14 e 30 períodos), MACD, Momentum, Estocástico, CCI e EMA como features para um classificador XGBoost prever alta/baixa do Bitcoin, alcançando acurácia acima de 92% — bem acima de um estudo anterior citado no mesmo paper com Random Forest (86%) e de outro com ensembles LSTM/GRU nas 100 principais criptomoedas (52,9%–54,1%, faixa bem mais modesta). Essa grande variação entre estudos ilustra como resultado depende muito de metodologia, ativo e período. Fonte: [Predicting Bitcoin Market Trends with Enhanced Technical Indicator Integration (arXiv)](https://arxiv.org/html/2410.06935v1).

### Observação metodológica central desta seção

Os resultados são altamente sensíveis a timeframe (o mesmo RSI teve Sharpe de 5,13 no 4H e -0,45 no 5min, no mesmo par) e a regime de mercado (Bollinger Bands teve desempenho oposto em bear vs. bull market). Qualquer score de oportunidade deveria tratar isso como variável de entrada — não presumir que um indicador é "universalmente" bom ou ruim. O achado mais consistente entre fontes independentes é que RSI superou MACD em pelo menos dois estudos (2020–2022 e 2025), e que Bollinger Bands (especialmente com confirmação de volume) teve o melhor desempenho individual em dois estudos independentes.

---

## 2. Métricas on-chain para timing de mercado

| Métrica | O que mede | Limiares históricos publicados | Poder preditivo documentado? |
|---|---|---|---|
| **MVRV Z-Score** | (Market Cap − Realized Cap) / desvio-padrão do Market Cap — desvio estatístico de valuation | Zona vermelha (topo) quando muito acima de 0; zona verde (fundo) perto de 0 ou negativo — Glassnode não publica corte numérico exato na doc consultada | Os criadores da métrica (Mahmudov & Puell, 2018) reivindicam "90%+ de acurácia" prevendo topos, mas isso é uma alegação dos próprios autores, não uma validação estatística independente detalhada |
| **SOPR** | Valor realizado / valor de aquisição das moedas movimentadas | SOPR = 1 é o nível-chave: suporte em bull market, resistência em bear market (formulação consensual no setor) | Não encontrei estatística quantificada publicada pela Glassnode |
| **NVT Ratio** | Market Cap / volume de transações on-chain (análogo ao P/L de ações) | NVT alto → historicamente coincide com topos; NVT baixo → períodos de acumulação. Sem limiar numérico absoluto publicado (só válido comparando ciclos de maturidade similar) | Não encontrado |
| **Puell Multiple** | Receita diária dos mineradores / média móvel de 365 dias | Topo: acima de 4,0 (ciclos iniciais chegaram a 6–10); Fundo: abaixo de 1,0, fundos fortes abaixo de 0,5 | Padrão histórico documentado pela Glassnode, mas sem taxa de acerto quantificada entre ciclos |
| **Reserve Risk** | Preço ÷ "HODL Bank" (custo de oportunidade acumulado de não vender) | Subvalorização: abaixo de 0,0026; Sobrevalorização: acima de 0,0200 (limiares "empíricos" da própria Glassnode) | Padrão cíclico documentado (fases baixas longas, fases altas curtas), sem taxa de acerto quantificada |
| **Exchange Netflow** | Entradas − saídas de exchanges | Netflow positivo → viés baixista; negativo → viés altista (leitura relativa, sem limiar absoluto) | CryptoQuant afirma que a métrica "explica razoavelmente bem" o sentimento nos últimos 3 anos — claim qualitativo, não backtest formal |
| **Realized Cap** | Soma do valor de cada moeda ao preço da última movimentação | Usado para detectar capitulação (perdas realizadas disparam em fundos) | Glassnode estima ~US$0,25–0,45 de fluxo real de capital por US$1 de variação no valor de mercado (efeito multiplicador de 3-4x) |
| **Funding Rate** (perpétuos) | Taxa paga entre longs e shorts a cada ~8h | Fortemente positivo e sustentado → excesso de alavancagem comprada (risco de topo); fortemente negativo → risco de short squeeze/fundo local. Limiar numérico exato não confirmado nesta pesquisa | Estudo da BitMEX Research (out/2025) mostrou funding rate positivo 92% do tempo historicamente — um viés estrutural do mercado, não necessariamente um sinal cíclico |
| **Open Interest** | Valor nocional total de contratos futuros/perpétuos em aberto | OI em máxima histórica + funding elevado → risco de cascata de liquidação. Sem limiar numérico absoluto publicado | Não encontrado dado quantificado |
| **Long/Short Ratio** | Proporção de posições compradas vs. vendidas | Tratado como indicador contrário: extremos de long → possível topo; extremos de short → possível fundo | Sem limiar numérico confirmado nesta pesquisa |

Fontes principais: [MVRV-Z Score (Glassnode Docs)](https://docs.glassnode.com/further-information/metric-guides/mvrv/mvrv-z-score) · [SOPR (Glassnode Docs)](https://docs.glassnode.com/guides-and-tutorials/metric-guides/sopr/sopr-spent-output-profit-ratio) · [NVT Ratio (Glassnode Docs)](https://docs.glassnode.com/further-information/metric-guides/nvt/nvt-ratio) · [Puell Multiple (Glassnode Docs)](https://docs.glassnode.com/further-information/metric-guides/coin-issuance/puell-multiple) · [Reserve Risk (Glassnode Docs)](https://docs.glassnode.com/further-information/metric-guides/coin-days-destroyed/reserve-risk) · [Exchange In/Outflow and Netflow (CryptoQuant User Guide)](https://userguide.cryptoquant.com/cryptoquant-metrics/exchange/exchange-in-outflow-and-netflow) · [The Foundational On-chain Metric: The Realized Cap (Glassnode Insights)](https://insights.glassnode.com/the-realized-cap-foundation/) · [Funding Rates (CryptoQuant User Guide)](https://userguide.cryptoquant.com/cryptoquant-metrics/market/funding-rates) · [BitMEX Study Finds Cryptocurrency Funding Rates Positive 92% of the Time (GlobeNewswire)](https://www.globenewswire.com/news-release/2025/10/14/3166184/0/en/BitMEX-Study-Finds-Cryptocurrency-Funding-Rates-Positive-92-of-the-Time-Revealing-a-Structural-Market-Bias.html) · [Cryptocurrency Open Interest (CoinGlass)](https://www.coinglass.com/pro/futures/OpenInterest) · [What is the Bitcoin long/short ratio (CoinGlass)](https://www.coinglass.com/learn/what-is-the-bitcoin-long-short-ratio-and-crypto-futures-longs-vs-shorts).

Vale nota adicional: há um paper acadêmico recente relevante para validar formalmente o poder preditivo de MVRV/SOPR/NVT — [Using on-chain data to predict Bitcoin cycles (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0275531926002138) — que não consegui acessar integralmente nesta pesquisa; vale leitura direta se quiser embasamento acadêmico mais forte para essa camada do score.

---

## 3. Índices e scores compostos já existentes na indústria

### Crypto Fear & Greed Index (Alternative.me)

É o único entre os grandes índices que divulga publicamente componentes **e** pesos exatos (confirmado em múltiplas fontes independentes durante a verificação):

- **Volatilidade — 25%**: volatilidade atual e máximos drawdowns do BTC vs. médias de 30/90 dias.
- **Momentum de mercado / Volume — 25%**: volume e momentum atuais vs. médias históricas.
- **Redes sociais — 15%**: engajamento com hashtags/posts sobre Bitcoin no X/Twitter.
- **Pesquisas (Surveys) — 15%**: enquetes via strawpoll.com (atualmente pausado segundo a própria página).
- **Dominância do BTC — 10%**: dominância subindo = medo/fuga para BTC; caindo = apetite a risco em altcoins.
- **Google Trends — 10%**: volume de busca por termos relacionados a Bitcoin.

Fonte: [Crypto Fear & Greed Index (Alternative.me)](https://alternative.me/crypto/fear-and-greed-index/).

### Outros índices e scores (metodologia parcial ou não pública)

- **CMC Fear and Greed Index** (CoinMarketCap): combina price momentum das top 10 moedas, volatilidade implícita (índices BVIV/EVIV da Volmex), put/call ratio de derivativos, Stablecoin Supply Ratio e dados proprietários de busca/redes sociais — mas **não divulga os pesos** de combinação. Fonte: [CoinMarketCap Introduces the CMC Fear and Greed Index](https://coinmarketcap.com/academy/article/coinmarketcap-introduces-the-cmc-fear-and-greed-index).
- **Coinglass Fear & Greed Index**: sem página de metodologia pública encontrada — tratar como caixa-preta.
- **LunarCrush Galaxy Score™**: combina Price Score (médias móveis + RSI + Bollinger + EMA calibrados por backtest), Social Sentiment, Social Impact/engajamento e Correlation Rank — pesos exatos não divulgados. Fonte: [How does LunarCRUSH help you understand social metrics (Medium)](https://medium.com/lunarcrush/how-does-lunarcrush-help-you-understand-social-metrics-in-cryptocurrency-markets-102fd9c5cb6e).
- **IntoTheBlock**: não tem um score único — publica indicadores individuais (In/Out of the Money, Concentration, Large Transactions) classificados em sinais Bullish/Neutral/Bearish, sem a fórmula interna de classificação divulgada.
- **Santiment Sentiment Score**: modelo de ML (`ElKulako/cryptobert`, baseado em BERT) treinado com 1,6 milhão de tweets rotulados, retornando probabilidades bullish/neutral/bearish. Fonte: [Sentiment metrics (Santiment Academy)](https://academy.santiment.net/metrics/sentiment-metrics/).

### Literatura sobre como construir seu próprio índice composto

Para a parte de normalização (colocar métricas em escalas diferentes numa base comum) e ponderação, a referência mais sólida é o **Handbook on Constructing Composite Indicators** da OCDE/Comissão Europeia — o mesmo tipo de metodologia usada em índices como o IDH — que cobre técnicas de normalização (min-max, z-score, ranking) e ponderação (pesos iguais, PCA, opinião de especialistas, regressão). Fonte: [Handbook on Constructing Composite Indicators (OECD, PDF)](https://www.oecd.org/content/dam/oecd/en/publications/reports/2008/08/handbook-on-constructing-composite-indicators-methodology-and-user-guide_g1gh9301/9789264043466-en.pdf).

Especificamente para cripto, dois papers são diretamente relevantes: um usa **PCA (Análise de Componentes Principais)** para derivar pesos objetivos de um índice cripto composto em vez de pesos arbitrários — [Principal component analysis based construction and evaluation of cryptocurrency index (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S0957417420306151) — e outro relaciona métricas on-chain e sentimento via causalidade estatística, útil como base teórica para justificar combinar os dois tipos de dado — [On-chain analytics for sentiment-driven statistical causality in cryptocurrencies (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2096720922000033).

---

## 4. Gestão de risco e regras de trade

### Position sizing (regra de 1–2% por trade)

A diretriz mais difundida é arriscar no máximo 1–2% do capital total por trade, calculando o tamanho da posição a partir da distância até o stop-loss. Não vem de um estudo controlado único, mas da tradição de *money management* (Van Tharp, Alexander Elder) e de simulações de risco de ruína — com 1-2% por trade, são necessárias dezenas de perdas seguidas para zerar a conta. A base matemática mais rigorosa é o **Critério de Kelly** (Kelly, 1956), que calcula a fração ótima de capital a arriscar dado o win rate e o payoff; na prática, usa-se uma fração do Kelly "cheio" (¼ a ½), que converge empiricamente para a faixa de 1-2% em estratégias com win rate/R:R típicos. Fontes: [The 1% Risk Rule (Trade That Swing)](https://tradethatswing.com/the-1-risk-rule-for-day-trading-and-swing-trading/) · [Kelly Criterion for Crypto Position Sizing (Altrady)](https://www.altrady.com/blog/risk-management/kelly-criterion-crypto-position-sizing) · [Position Sizing in Trading (QuantInsti)](https://blog.quantinsti.com/position-sizing/).

### Relação Risco/Retorno (R:R) e win rate de equilíbrio

Com R:R de 1:N, o win rate mínimo para não perder dinheiro no longo prazo é `1 / (1 + N)`: R:R 1:2 exige win rate ≥ 33,3%; R:R 1:3 exige apenas 25%. A fórmula de expectância — `(Win Rate × Ganho médio) − (Loss Rate × Perda média)` — mostra por que uma estratégia com 40% de acerto e bom R:R pode superar uma com 60% de acerto e R:R ruim. Fontes: [Win Rate and Risk/Reward: Connection Explained (LuxAlgo)](https://www.luxalgo.com/blog/win-rate-and-riskreward-connection-explained/) · [Break-Even Win Rate (JournalPlus)](https://journalplus.co/metrics/break-even-rate/).

### Stop-loss e take-profit

Prática institucional recomendada (inclusive por exchanges como a Binance): definir primeiro o setup técnico, depois o método do stop (estrutura de preço, ATR etc.), calcular o risco em % do capital e o R:R alvo (a Binance cita 1:3 como referência), e usar ordens automatizadas de TP/SL. Fonte: [How Take-Profit and Stop-Loss Orders Can Help Traders Manage Risk Better (Binance Blog)](https://www.binance.com/en/blog/futures/how-takeprofit-and-stoploss-orders-can-help-traders-manage-risk-better-421499824684904021).

### Quanto os traders de varejo realmente perdem — dados publicados

Este é o dado mais robusto e mais citável de todo o levantamento, porque vem de reguladores e de um banco central, não de blogs:

- **Bitcoin especificamente**: um estudo do **BIS (Bank for International Settlements)**, usando dados de app de exchanges cripto de 95 países e dados on-chain (ago/2015–dez/2022), concluiu que cerca de **75% (três em cada quatro) dos compradores de varejo de Bitcoin perderam dinheiro**, com perdas mais severas em mercados emergentes (Brasil incluído). Uma reportagem da Ecofin Agency sobre o mesmo bulletin cita uma perda média de **47,89% dos fundos investidos**. Fontes: [Crypto shocks and retail losses — BIS Bulletin No 69](https://www.bis.org/publ/bisbull69.htm) · [About 75% of Retail Buyers of Bitcoin Lost Money, BIS Study Says (Bloomberg Law)](https://news.bloomberglaw.com/crypto/about-75-of-retail-buyers-of-bitcoin-lost-money-bis-study-says) · [Bitcoin: Retail investors lost 47.89% of invested funds on average (Ecofin Agency)](https://www.ecofinagency.com/finance/1104-44420-bitcoin-retail-investors-lost-47-89-of-invested-funds-on-average-bis-bulletin).
- **Forex/CFD na Europa (proxy regulado, não é cripto, mas com dados muito mais granulares por exigência legal)**: a ESMA reporta que **74% a 89%** das contas de varejo perdem dinheiro em CFDs. Um estudo da autoridade francesa **AMF** com 14.799 clientes reais (2009–2013) encontrou **89%+ de clientes perdedores**, perda média de €10.887 por cliente. No Reino Unido, corretoras são obrigadas a publicar o % de contas perdedoras: levantamento de 36 corretoras (2020) mostrou faixa de **60% a 81%** (GKFX 81%, Plus500 80,5%, eToro subiu de 62% para 75%). Fontes: [ESMA decision on CFDs](https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors) · [Étude AMF sur CFD/Forex (PDF)](https://www.amf-france.org/sites/institutionnel/files/contenu_simple/rapport_etude_analyse/epargne_prestataire/Etude%20des%20resultats%20des%20investisseurs%20particuliers%20sur%20le%20trading%20de%20CFD%20et%20de%20Forex%20en%20France.pdf) · [60%-80% of Retail Traders Lost Money Trading Forex CFDs (Wolf Street)](https://wolfstreet.com/2020/07/28/60-80-of-retail-traders-lost-money-with-forex-cfds-which-are-illegal-in-the-us-but-not-in-the-eu-uk-australia-other-countries/).
- **Day traders (não-cripto, mas estudo acadêmico com amostra completa de bolsa)**: Barber, Lee, Liu & Odean (2004), usando dados completos da bolsa de Taiwan, encontraram que **mais de 80% dos day traders perderam dinheiro** num semestre típico. Fonte: [Do Individual Day Traders Make Money? Evidence from Taiwan (paper original)](http://www.econ.yale.edu/~shiller/behfin/2004-04-10/barber-lee-liu-odean.pdf).

### Confluência de sinais (múltiplos indicadores concordando)

É um conceito amplamente ensinado — exigir que vários sinais independentes apontem na mesma direção antes de entrar, para reduzir falsos positivos. Porém, não encontrei nenhum estudo peer-reviewed ou institucional que meça de forma controlada se confluência realmente supera sinais isolados em win rate ou retorno ajustado ao risco — trate como prática de bom senso com racional lógico, não como achado comprovado por dados.

---

## 5. Como isso se traduz numa proposta de score de oportunidade

Juntando os quatro blocos acima, uma estrutura defensável para o seu score — alinhada tanto com a literatura de índices compostos (OECD Handbook, paper de PCA) quanto com o padrão de mercado (Fear & Greed) — teria três camadas separadas em vez de uma nota única misturando tudo:

**Camada 1 — Qualidade do sinal (0 a 100, é o "score" propriamente dito).** Combine três grupos de métricas normalizadas para a mesma escala (min-max ou z-score, como descrito no OECD Handbook): técnico (RSI multi-timeframe, MACD, Bollinger, médias móveis — com peso menor para MACD isolado, dado que foi consistentemente o pior indicador nos estudos acima), on-chain (MVRV Z-Score, SOPR, funding rate, exchange netflow) e sentimento/momentum (um Fear & Greed próprio ou reaproveitando a metodologia pública da Alternative.me, já que é a única com pesos documentados). Comece com pesos iguais entre os três grupos — é a abordagem mais defensável na ausência de dados próprios para calibrar via PCA ou regressão, e documente a fórmula publicamente (nenhum concorrente relevante faz isso, é um diferencial real).

**Camada 2 — Confiança/confluência.** Em vez de tratar confluência como parte do score numérico (não há dado que justifique isso), use-a como um modificador categórico visível separadamente — por exemplo, sinalizar quando os três grupos concordam (o que você já desenhou como "seção de destaques" no webapp) vs. quando divergem, deixando explícito para o usuário que divergência = menor confiança, sem inventar um número preciso para isso.

**Camada 3 — Gestão de risco (não faz parte do score, é um filtro aplicado depois dele).** Mesmo um sinal de score alto não deveria pular position sizing (1-2% por trade, ajustável por fração de Kelly), R:R mínimo antes de sugerir a entrada (ex: 1:2), e stop-loss definido tecnicamente. Os dados da seção 4 mostram que a maioria dos traders de varejo perde dinheiro mesmo com acesso aos mesmos indicadores — a diferença normalmente está na disciplina de risco, não na sofisticação do sinal.

Por fim, dado quanto o desempenho de cada indicador varia por timeframe e regime de mercado (seção 1), vale a pena o score reportar explicitamente em qual "regime" ele está operando (ex: tendência de alta/baixa/lateral, detectável por ADX ou pela inclinação de uma média longa) e, se possível, ajustar os pesos dos grupos técnico/on-chain conforme o regime — replicando a lógica encontrada no paper de Bollinger Bands por regime (seção 1), em vez de aplicar a mesma fórmula estática sempre.
