import { lazy, Suspense, useState, type ReactNode } from "react";
import clsx from "clsx";
import { BarChart2, LayoutDashboard, Moon, Settings, Sun, Wallet, X } from "lucide-react";
import { useMarketData } from "./hooks/useMarketData";
import { useWatchlistTokens } from "./hooks/useWatchlistTokens";
import { useWatchlistSignals } from "./hooks/useWatchlistSignals";
import { useMarketPanorama } from "./hooks/useMarketPanorama";
import { useWallet } from "./hooks/useWallet";
import { useTheme } from "./hooks/useTheme";
import { useScoreHistory } from "./hooks/useScoreHistory";
import { useScoreAlerts } from "./hooks/useScoreAlerts";
import { useCompareCandles } from "./hooks/useCompareCandles";
import { loadSettings, saveSettings } from "./lib/settings";
import { MarketHighlights } from "./components/MarketHighlights";
import { MarketOverview } from "./components/MarketOverview";
import { MarketPanorama } from "./components/MarketPanorama";
import { MarketWatchlist } from "./components/MarketWatchlist";
import { TokenSelector } from "./components/TokenSelector";
import { SettingsModal } from "./components/SettingsModal";
import { Spinner } from "./components/common";
import type { Currency } from "./lib/currency";
import type { ChainKey, Timeframe } from "./types";

// USD/BRL toggle is on hold until we build out Carteira, which is where a
// currency choice actually matters (a wallet has real holdings to convert).
// The Mercado tab stays USD-only for now — formatPrice/formatMoney remain
// currency-aware so this is a one-line change to re-enable later.
const MERCADO_CURRENCY: Currency = "USD";

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
  { label: "1S", value: "1w" },
  { label: "1M", value: "1M" },
];

type Tab = "market" | "wallet";

function App() {
  const [settings, setSettings] = useState(loadSettings());
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<Tab>("market");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(settings.watchlist);
  const [portfolio, setPortfolio] = useState<string[]>(settings.portfolio);
  const [tokenId, setTokenId] = useState<string | null>(settings.selectedTokenId || null);
  const [timeframe, setTimeframe] = useState<Timeframe>(settings.timeframe);
  const [compareBtc, setCompareBtc] = useState(false);
  const [walletQuery, setWalletQuery] = useState<{ address: string; chain: ChainKey }>({
    address: settings.walletAddress,
    chain: settings.chain,
  });

  const watchlistTokens = useWatchlistTokens(watchlist, settings.coingeckoApiKey || undefined);
  const signalsByToken = useWatchlistSignals(watchlist, settings.coingeckoApiKey || undefined);
  const scoreHistory = useScoreHistory(signalsByToken);
  useScoreAlerts(signalsByToken, watchlistTokens.tokens, settings.alertsEnabled);
  const panorama = useMarketPanorama(settings.coingeckoApiKey || undefined);
  const market = useMarketData(tokenId, timeframe, settings.coingeckoApiKey || undefined);
  const compare = useCompareCandles(compareBtc, tokenId, timeframe, settings.coingeckoApiKey || undefined);
  const wallet = useWallet(walletQuery.address, walletQuery.chain, settings.etherscanApiKey);

  const selectedToken = watchlistTokens.tokens.find((t) => t.id === tokenId);

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
    // A token no longer on the watchlist can't stay flagged as portfolio.
    const nextPortfolio = portfolio.filter((p) => p !== id);
    setPortfolio(nextPortfolio);
    persist({
      ...settings,
      watchlist: nextWatchlist,
      portfolio: nextPortfolio,
      selectedTokenId: nextTokenId ?? "",
    });
  }

  function handleTogglePortfolio(id: string) {
    const nextPortfolio = portfolio.includes(id)
      ? portfolio.filter((p) => p !== id)
      : [...portfolio, id];
    setPortfolio(nextPortfolio);
    persist({ ...settings, portfolio: nextPortfolio });
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
            <MarketPanorama currency={MERCADO_CURRENCY} data={panorama.data} />
            {panorama.isDemo && (
              <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
                Modo demonstração: não foi possível carregar o panorama de mercado agora
                {panorama.error ? ` (${panorama.error})` : ""}. Exibindo dados simulados.
              </div>
            )}
            <MarketHighlights tokens={watchlistTokens.tokens} signalsByToken={signalsByToken} />

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
              currency={MERCADO_CURRENCY}
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
                  currency={MERCADO_CURRENCY}
                  signalsByToken={signalsByToken}
                  scoreHistoryByToken={scoreHistory}
                  portfolioIds={portfolio}
                  onTogglePortfolio={handleTogglePortfolio}
                />

                {tokenId && (
                  <div className="flex flex-col gap-4">
                    {!market.loading && market.isDemo && (
                      <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
                        Modo demonstração para o gráfico: {market.error}. Exibindo candles
                        simulados.
                      </div>
                    )}
                    {!market.loading && (
                      <MarketOverview
                        token={selectedToken}
                        candles={market.candles}
                        bollinger={market.bollinger}
                        currency={MERCADO_CURRENCY}
                        signals={tokenId ? signalsByToken[tokenId] : undefined}
                        scoreHistory={tokenId ? scoreHistory[tokenId] : undefined}
                      />
                    )}

                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-2">
                        <div className="flex flex-wrap items-center gap-2">
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
                          {tokenId !== "bitcoin" && (
                            <button
                              onClick={() => setCompareBtc((v) => !v)}
                              aria-pressed={compareBtc}
                              className={clsx(
                                "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs",
                                compareBtc
                                  ? "border-[#f59e0b] bg-[#f59e0b]/15 text-[#f59e0b]"
                                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                              )}
                            >
                              <BarChart2 size={13} />
                              Comparar com BTC
                            </button>
                          )}
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
                        <Suspense fallback={<TabFallback />}>
                          <PriceChart
                            candles={market.candles}
                            bollinger={market.bollinger}
                            rsi={market.rsi}
                            volume={market.volume}
                            theme={theme}
                            compareCandles={compareBtc ? compare.candles : undefined}
                          />
                        </Suspense>
                      )}
                    </div>
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
