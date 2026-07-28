# Crypto On-Chain Dashboard

Dashboard web (React + TypeScript + Vite) para análise de criptoativos: preço, volume e indicadores técnicos (RSI, Bollinger Bands), além de análise de carteiras on-chain (holdings, histórico de transações e insights de atividade).

Passo 1 do plano: validar tudo na web. Depois de ajustado, o mesmo código vira APK via [Capacitor](https://capacitorjs.com/).

## Stack

- **Vite + React 19 + TypeScript**
- **Tailwind CSS v4** para o layout
- **lightweight-charts** (candlestick + BB + volume + RSI em painéis)
- **recharts** (pizza de holdings, atividade por dia)
- **CoinGecko API** (preço, market cap, OHLC) — funciona sem API key (rate limit menor); key demo opcional em Configurações
- **Etherscan V2 API** (unificada multi-chain: Ethereum, BNB Chain, Polygon, Arbitrum, Base) para dados de carteira — precisa de uma API key gratuita em [etherscan.io/apis](https://etherscan.io/apis)

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

- **Mercado**: seleção de token, gráfico de candles com Bollinger Bands, RSI(14) e volume, cards de overview com sinais (sobrecomprado/sobrevendido, dentro/fora das bandas).
- **Carteira**: input de endereço EVM + chain, saldo nativo, holdings estimados (pizza), histórico de transações, insights de atividade (compras vs vendas, gas gasto, token mais movimentado, atividade por dia).

## Roadmap para APK

1. ✅ Dashboard web funcional (este repositório)
2. Ajustar a UX com base no uso real
3. `npx cap init` + `npx cap add android` (Capacitor) reaproveitando 100% deste frontend
4. Build (`npm run build`) → `npx cap sync` → gerar APK via Android Studio / Gradle
