import { useState } from "react";
import { X } from "lucide-react";
import type { AppSettings } from "../types";

interface SettingsModalProps {
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
}

export function SettingsModal({ settings, onClose, onSave }: SettingsModalProps) {
  const [form, setForm] = useState(settings);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text)]">Configurações</h2>
          <button onClick={onClose} className="text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[var(--color-text-dim)]">API Key Etherscan (V2, multi-chain)</span>
            <input
              value={form.etherscanApiKey}
              onChange={(e) => setForm({ ...form, etherscanApiKey: e.target.value })}
              placeholder="sua api key"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <span className="text-xs text-[var(--color-text-dim)]">
              Grátis em etherscan.io/apis. Sem key, a carteira usa dados de demonstração.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[var(--color-text-dim)]">API Key CoinGecko (opcional)</span>
            <input
              value={form.coingeckoApiKey}
              onChange={(e) => setForm({ ...form, coingeckoApiKey: e.target.value })}
              placeholder="demo key (opcional)"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <span className="text-xs text-[var(--color-text-dim)]">
              Preços/indicadores já funcionam sem key (limite de requisições menor).
            </span>
          </label>

          <p className="text-xs text-[var(--color-text-dim)]">
            As chaves ficam salvas apenas no seu navegador (localStorage), nunca são enviadas para
            nenhum servidor além das APIs oficiais.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
