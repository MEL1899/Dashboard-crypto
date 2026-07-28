import { lazy, Suspense, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Activity, LayoutDashboard, Settings, Wallet } from "lucide-react";
import { useMarketData } from "./hooks/useMarketData";
import { useWallet } from "./hooks/useWallet";
import { useDerivatives } from "./hooks/useDerivatives";
import { loadSettings, saveSettings } from "./lib/settings";
import { MarketOverview } from "./components/MarketOverview";
import { TokenSelector } from "./components/TokenSelector";
import { SettingsModal } from "./components/SettingsModal";
import { Spinner } from "./components/common";
import type { ChainKey } from "./types";

// Code-split the heavy charting views (lightweight-charts / recharts) so the
// initial bundle only pays for whichever tab is actually opened first.
const PriceChart = lazy(() =>
  import("./components/PriceChart").then((m) => ({ default: m.PriceChart })),
);
const DerivativesPanel = lazy(() =>
  import("./components/DerivativesPanel").then((m) => ({ default: m.DerivativesPanel })),
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

const RANGE_OPTIONS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
];

type Tab = "market" | "derivatives" | "wallet";

function App() {
  const [settings, setSettings] = useState(loadSettings());
  const [tab, setTab] = useState<Tab>("market");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tokenId, setTokenId] = useState(settings.tokenId);
  const [days, setDays] = useState(settings.days);
  const [walletQuery, setWalletQuery] = useState<{ address: string; chain: ChainKey }>({
    address: settings.walletAddress,
    chain: settings.chain,
  });

  const market = useMarketData(tokenId, days, settings.coingeckoApiKey || undefined);
  const wallet = useWallet(walletQuery.address, walletQuery.chain, settings.etherscanApiKey);
  const derivatives = useDerivatives(tokenId);

  const selectedToken = market.tokens.find((t) => t.id === tokenId);

  function handleSaveSettings(next: typeof settings) {
    setSettings(next);
    saveSettings(next);
    setSettingsOpen(false);
  }

  function handleWalletSubmit(address: string, chain: ChainKey) {
    setWalletQuery({ address, chain });
    const next = { ...settings, walletAddress: address, chain };
    setSettings(next);
    saveSettings(next);
  }

  function handleTokenSelect(id: string) {
    setTokenId(id);
    const next = { ...settings, tokenId: id };
    setSettings(next);
    saveSettings(next);
  }

  function handleDaysSelect(next: number) {
    setDays(next);
    const nextSettings = { ...settings, days: next };
    setSettings(nextSettings);
    saveSettings(nextSettings);
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
            <TabButton
              active={tab === "derivatives"}
              onClick={() => setTab("derivatives")}
              icon={<Activity size={14} />}
            >
              Derivativos
            </TabButton>
            <TabButton active={tab === "wallet"} onClick={() => setTab("wallet")} icon={<Wallet size={14} />}>
              Carteira
            </TabButton>
          </nav>

          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            <Settings size={14} />
            Configurações
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {tab === "market" ? (
          <div className="flex flex-col gap-4">
            {market.isDemo && (
              <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
                Modo demonstração: não foi possível carregar dados reais da CoinGecko agora
                {market.error ? ` (${market.error})` : ""}. Exibindo dados simulados.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <TokenSelector
                tokens={market.tokens}
                selectedId={tokenId}
                onSelect={handleTokenSelect}
              />
              <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1">
                {RANGE_OPTIONS.map((r) => (
                  <button
                    key={r.days}
                    onClick={() => handleDaysSelect(r.days)}
                    className={clsx(
                      "rounded-md px-2.5 py-1 text-xs",
                      days === r.days
                        ? "bg-[var(--color-accent)] text-white"
                        : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {market.loading ? (
              <div className="flex h-96 items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <>
                <MarketOverview
                  token={selectedToken}
                  candles={market.candles}
                  rsi={market.rsi}
                  bollinger={market.bollinger}
                />
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                  <Suspense fallback={<TabFallback />}>
                    <PriceChart
                      candles={market.candles}
                      bollinger={market.bollinger}
                      rsi={market.rsi}
                      volume={market.volume}
                    />
                  </Suspense>
                </div>
              </>
            )}
          </div>
        ) : tab === "derivatives" ? (
          <Suspense fallback={<TabFallback />}>
            <DerivativesPanel
              tokenSymbol={selectedToken?.symbol ?? tokenId.toUpperCase()}
              loading={derivatives.loading || market.loading}
              isDemo={derivatives.isDemo}
              error={derivatives.error}
              data={derivatives.data}
              rsi={market.rsi}
              bollinger={market.bollinger}
              lastClose={market.candles.length ? market.candles[market.candles.length - 1].close : null}
            />
          </Suspense>
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
