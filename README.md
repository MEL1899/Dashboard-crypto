# Crypto On-Chain Dashboard

Dashboard web (React + TypeScript + Vite) para análise de criptoativos: preço, volume e indicadores técnicos (RSI, Bollinger Bands), além de análise de carteiras on-chain (holdings, histórico de transações e insights de atividade).

Passo 1 do plano: validar tudo na web. Depois de ajustado, o mesmo código vira APK via [Capacitor](https://capacitorjs.com/).

## Stack

- **Vite + React 19 + TypeScript**
- **Tailwind CSS v4** para o layout
- **lightweight-charts** (candlestick + BB + volume + RSI em painéis)
- **recharts** (pizza de holdings, atividade por dia)
- **Binance API** (spot, pública, sem key) — fonte primária de preço/candles para os principais ativos (BTC, ETH, SOL, etc.): mesma fonte alimenta o card de preço, a tabela e o gráfico, então nunca ficam incoerentes entre si
- **CoinGecko API** (preço, market cap, OHLC/candles por timeframe) — enriquece com market cap/nome/imagem e cobre ativos fora da Binance; funciona sem API key (rate limit menor), key demo opcional em Configurações
- **Etherscan V2 API** (unificada multi-chain: Ethereum, BNB Chain, Polygon, Arbitrum, Base) para dados de carteira — precisa de uma API key gratuita em [etherscan.io/apis](https://etherscan.io/apis)
- **DeFiLlama API** (TVL por chain) — sem API key

Sem API key configurada, o dashboard cai automaticamente em **modo demonstração** com dados simulados (mas realistas), então a UI nunca fica quebrada.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

## Configuração

Clique em **Configurações** no topo para adicionar:
- API key da Etherscan (necessária para ver dados reais de carteira)
- API key da CoinGecko (opcional, aumenta o limite de requisições)

As chaves ficam salvas só no `localStorage` do navegador.

## Funcionalidades

- **Mercado**: watchlist própria (começa vazia, você busca e adiciona os ativos que quer acompanhar), tabela geral ordenável como visão principal — o gráfico só abre ao clicar num ativo, com timeframes reais 1H/4H/1D, candles com Bollinger Bands, RSI(14) e volume. Cada ativo carrega o **score de oportunidade** e a **leitura** (compra / venda / lateral / contra a tendência), e o painel de **gestão de risco** fecha a aba.
- **Backtest**: roda o mesmo score sobre o histórico da watchlist inteira, com stop/alvo, custo de 0,30% por trade e posição dimensionada para arriscar 1% do capital. O número que importa é a comparação contra **entradas aleatórias com a mesma gestão de risco** — se o sinal não vence o acaso, ele não demonstrou edge nenhum.
- **Carteira**: input de endereço EVM + chain, TVL da chain (DeFiLlama), saldo nativo, holdings estimados (pizza), histórico de transações, insights de atividade (compras vs vendas, gas gasto, token mais movimentado, atividade por dia).

## O score de oportunidade

Três camadas separadas, que nunca se misturam numa nota só (`src/lib/score/`):

1. **Qualidade do sinal** (0-100) — três grupos com peso igual: técnico (RSI multi-timeframe, Bollinger %b, MACD, distância da EMA longa), on-chain (MVRV, funding rate, exchange netflow) e sentimento (Fear & Greed). Todos os pesos, faixas e direções vivem em `score/config.ts`, e o painel "Como funciona?" é **gerado desse mesmo objeto** — a documentação não tem como divergir da conta. Métrica sem dado sai do cálculo e o grupo entra com peso proporcional ao que sobrou.
2. **Confluência** — rótulo de "os grupos concordam?". Nunca entra na nota: não há estudo publicado mostrando que confluência aumenta win rate.
3. **Gestão de risco** — aplicada *depois* do score e sem recebê-lo como entrada. Tamanho da posição sai do capital e da distância até o stop, limitado ao capital (o app não dimensiona posição alavancada). Um score alto não compra uma posição maior.

Ao lado disso, o **regime de mercado** (ADX + inclinação da média longa) diz se o mercado está em tendência ou lateral, e qualifica a leitura — o score é contrário em todos os grupos, então uma compra em tendência de baixa aparece como aviso, não como oportunidade. O regime descreve o estado **atual**; não é previsão.

### Limitações que valem saber

- MVRV e exchange netflow não têm fonte gratuita e ficam de fora na prática.
- As faixas de normalização são ponto de partida, não valores calibrados com dado histórico.
- O sinal **ainda não demonstrou edge** contra entradas aleatórias no backtest. Isso está exposto na própria aba, de propósito.

## Roadmap para APK

1. ✅ Dashboard web funcional (este repositório)
2. Ajustar a UX com base no uso real
3. `npx cap init` + `npx cap add android` (Capacitor) reaproveitando 100% deste frontend
4. Build (`npm run build`) → `npx cap sync` → gerar APK via Android Studio / Gradle
