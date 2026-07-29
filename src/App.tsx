import { lazy, Suspense, useState, type ReactNode } from "react";
import clsx from "clsx";
import { LayoutDashboard, Moon, Settings, Sun, Wallet, X } from "lucide-react";
import { useMarketData } from "./hooks/useMarketData";
import { useWatchlistTokens } from "./hooks/useWatchlistTokens";
import { useWallet } from "./hooks/useWallet";
import { useTheme } from "./hooks/useTheme";
import { useCurrency } from "./hooks/useCurrency";
import { loadSettings, saveSettings } from "./lib/settings";
import { computeOpportunityScoreFromMarket } from "./lib/opportunityScore";
import { MarketHighlights } from "./components/MarketHighlights";
import { MarketOverview } from "./components/MarketOverview";
import { MarketPanorama } from "./components/MarketPanorama";
import { MarketWatchlist } from "./components/MarketWatchlist";
import { TokenSelector } from "./components/TokenSelector";
import { SettingsModal } from "./components/SettingsModal";
import { Spinner } from "./components/common";
import type { ChainKey, Timeframe } from "./types";

// Code-split the heavy charting views (lightweight-charts / recharts) so the
// initial bundle only pays for whichever tab is actually opened first.
const PriceChart = lazy(() =>
  import("./components/PriceChart").then((m) => ({ default: m.PriceChart })),
);
const WalletPanel = lazy(() =>
  import("./components/WalletPanel").then((m) => ({ default: m.WalletPanel })),
);

function TabFallback() {
  return (
    <div className="flex h-96 items-center justify-center">
      <Spinner />
    </div>
  );
}

const TIMEFRAME_OPTIONS: { label: string; value: Timeframe }[] = [
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
];

type Tab = "market" | "wallet";

function App() {
  const [settings, setSettings] = useState(loadSettings());
  const { theme, toggleTheme } = useTheme();
  const { currency, toggleCurrency } = useCurrency();
  const [tab, setTab] = useState<Tab>("market");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(settings.watchlist);
  const [tokenId, setTokenId] = useState<string | null>(settings.selectedTokenId || null);
  const [timeframe, setTimeframe] = useState<Timeframe>(settings.timeframe);
  const [walletQuery, setWalletQuery] = useState<{ address: string; chain: ChainKey }>({
    address: settings.walletAddress,
    chain: settings.chain,
  });

  const watchlistTokens = useWatchlistTokens(watchlist, settings.coingeckoApiKey || undefined);
  const market = useMarketData(tokenId, timeframe, settings.coingeckoApiKey || undefined);
  const wallet = useWallet(walletQuery.address, walletQuery.chain, settings.etherscanApiKey);

  const selectedToken = watchlistTokens.tokens.find((t) => t.id === tokenId);
  // The table's own Score column is a lightweight mock (see MarketWatchlist);
  // for whichever token's chart is actually open, we already have real
  // candles/RSI/Bollinger fetched, so show that row the same score the
  // detail panel below computes, instead of a different mocked number.
  const selectedScore =
    tokenId && !market.loading && market.candles.length > 0
      ? computeOpportunityScoreFromMarket(market.candles, market.rsi, market.bollinger)
      : undefined;

  function persist(next: typeof settings) {
    setSettings(next);
    saveSettings(next);
  }

  function handleSaveSettings(next: typeof settings) {
    persist(next);
    setSettingsOpen(false);
  }

  function handleWalletSubmit(address: string, chain: ChainKey) {
    setWalletQuery({ address, chain });
    persist({ ...settings, walletAddress: address, chain });
  }

  function handleAddToken(id: string) {
    if (watchlist.includes(id)) return;
    const nextWatchlist = [...watchlist, id];
    setWatchlist(nextWatchlist);
    persist({ ...settings, watchlist: nextWatchlist });
  }

  function handleCloseChart() {
    setTokenId(null);
    persist({ ...settings, selectedTokenId: "" });
  }

  function handleRemoveToken(id: string) {
    const nextWatchlist = watchlist.filter((w) => w !== id);
    setWatchlist(nextWatchlist);
    // Removing the token whose chart is open just closes the chart.
    const nextTokenId = tokenId === id ? null : tokenId;
    setTokenId(nextTokenId);
    persist({ ...settings, watchlist: nextWatchlist, selectedTokenId: nextTokenId ?? "" });
  }

  function handleTokenSelect(id: string) {
    setTokenId(id);
    persist({ ...settings, selectedTokenId: id });
  }

  function handleTimeframeSelect(next: Timeframe) {
    setTimeframe(next);
    persist({ ...settings, timeframe: next });
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-10">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
              <LayoutDashboard size={18} />
            </div>
            <span className="text-sm font-semibold text-[var(--color-text)]">
              Crypto On-Chain Dashboard
            </span>
          </div>

          <nav className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1">
            <TabButton active={tab === "market"} onClick={() => setTab("market")} icon={<LayoutDashboard size={14} />}>
              Mercado
            </TabButton>
            <TabButton active={tab === "wallet"} onClick={() => setTab("wallet")} icon={<Wallet size={14} />}>
              Carteira
            </TabButton>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleCurrency}
              aria-label={`Mudar para ${currency === "USD" ? "Real" : "Dólar"}`}
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-xs font-medium text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              {currency === "USD" ? "US$" : "R$"}
            </button>

            <button
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
              className="flex items-center justify-center rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              <Settings size={14} />
              Configurações
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {tab === "market" ? (
          <div className="flex flex-col gap-4">
            <MarketPanorama currency={currency} />
            <MarketHighlights />

            {watchlistTokens.isDemo && watchlist.length > 0 && (
              <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
                Modo demonstração: não foi possível carregar dados reais da CoinGecko agora
                {watchlistTokens.error ? ` (${watchlistTokens.error})` : ""}. Exibindo dados
                simulados.
              </div>
            )}

            <TokenSelector
              tokens={watchlistTokens.tokens}
              selectedId={tokenId}
              onSelect={handleTokenSelect}
              onAdd={handleAddToken}
              onRemove={handleRemoveToken}
              apiKey={settings.coingeckoApiKey || undefined}
              currency={currency}
            />

            {watchlist.length === 0 ? (
              <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] py-16 text-center">
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Sua watchlist está vazia
                </p>
                <p className="max-w-xs text-xs text-[var(--color-text-dim)]">
                  Use a busca acima (ou as sugestões) para adicionar as criptos que você quer
                  acompanhar.
                </p>
              </div>
            ) : (
              <>
                <MarketWatchlist
                  tokens={watchlistTokens.tokens}
                  selectedId={tokenId}
                  onSelect={handleTokenSelect}
                  currency={currency}
                  selectedScore={selectedScore}
                />

                {tokenId && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1">
                        {TIMEFRAME_OPTIONS.map((t) => (
                          <button
                            key={t.value}
                            onClick={() => handleTimeframeSelect(t.value)}
                            className={clsx(
                              "rounded-md px-2.5 py-1 text-xs",
                              timeframe === t.value
                                ? "bg-[var(--color-accent)] text-white"
                                : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                            )}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={handleCloseChart}
                        className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                      >
                        <X size={13} />
                        Fechar gráfico
                      </button>
                    </div>

                    {market.loading ? (
                      <div className="flex h-96 items-center justify-center">
                        <Spinner />
                      </div>
                    ) : (
                      <>
                        {market.isDemo && (
                          <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
                            Modo demonstração para o gráfico: {market.error}. Exibindo candles
                            simulados.
                          </div>
                        )}
                        <MarketOverview
                          token={selectedToken}
                          candles={market.candles}
                          rsi={market.rsi}
                          bollinger={market.bollinger}
                          currency={currency}
                          timeframe={timeframe}
                        />
                        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                          <Suspense fallback={<TabFallback />}>
                            <PriceChart
                              candles={market.candles}
                              bollinger={market.bollinger}
                              rsi={market.rsi}
                              volume={market.volume}
                              theme={theme}
                            />
                          </Suspense>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <Suspense fallback={<TabFallback />}>
            <WalletPanel
              address={walletQuery.address}
              chain={walletQuery.chain}
              loading={wallet.loading}
              isDemo={wallet.isDemo}
              error={wallet.error}
              snapshot={wallet.snapshot}
              onSubmit={handleWalletSubmit}
            />
          </Suspense>
        )}
      </main>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-[var(--color-accent)] text-white"
          : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export default App;
