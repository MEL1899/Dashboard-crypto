import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Currency } from "../lib/currency";
import { sugerirGestaoDeRisco } from "../lib/score/riskManagement";
import { Card, formatPrice } from "./common";

/**
 * Layer 3 in the UI: position sizing and the retail-loss disclaimer.
 *
 * The disclaimer is rendered in full, at the top, never behind a tooltip or
 * a collapsed section. That is a deliberate product decision, not a legal
 * footnote — the figures in it (BIS: ~75% of retail Bitcoin buyers lost
 * money; ESMA/AMF: 74-89% of CFD accounts lose) are the most robust
 * numbers in docs/pesquisa-score-oportunidade.md, and section 4 of that
 * document argues risk discipline separates survivors more than signal
 * quality does.
 *
 * Note what this panel does NOT take: the score. Position size is derived
 * from capital and stop distance alone, so a high reading can never talk
 * the user into a bigger bet.
 */

function Field({
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-[var(--color-text-dim)]">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="num-mono w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        {suffix && <span className="text-xs text-[var(--color-text-dim)]">{suffix}</span>}
      </div>
    </label>
  );
}

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function RiskGuidancePanel({ currency }: { currency: Currency }) {
  const [capital, setCapital] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [riskPct, setRiskPct] = useState("1");

  const guidance = sugerirGestaoDeRisco({
    capital: parseNumber(capital),
    entryPrice: parseNumber(entryPrice),
    stopPrice: parseNumber(stopPrice),
    riskPerTradePct: parseNumber(riskPct) ?? undefined,
  });
  const size = guidance.positionSize;

  return (
    <Card title="Gestão de risco">
      {/* Always visible, always complete — see the module comment. */}
      <div className="mb-4 flex gap-2.5 rounded-lg border border-[var(--color-down)]/40 bg-[var(--color-down)]/10 p-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--color-down)]" />
        <p className="text-xs leading-relaxed text-[var(--color-text)]">{guidance.disclaimer}</p>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-dim)]">
        Esta camada é aplicada <strong>depois</strong> do score e não recebe a nota como entrada: o
        tamanho da posição sai do capital e da distância até o stop, nunca da convicção do sinal.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Capital total" value={capital} onChange={setCapital} placeholder="10000" />
        <Field label="Preço de entrada" value={entryPrice} onChange={setEntryPrice} placeholder="100" />
        <Field label="Preço do stop" value={stopPrice} onChange={setStopPrice} placeholder="95" />
        <Field
          label={`Risco por trade (${guidance.riskRangePct.min}-${guidance.riskRangePct.max}%)`}
          value={riskPct}
          onChange={setRiskPct}
          placeholder="1"
          suffix="%"
        />
      </div>

      {size ? (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="text-xs text-[var(--color-text-dim)]">Capital em risco</div>
            {/* formatPrice, not formatMoney: a sizing calculator must never
                abbreviate to "$2.00K" — the difference between $2,000 and
                $2,047 is the whole point of computing it. */}
            <div className="num-mono mt-1 text-lg font-semibold text-[var(--color-down)]">
              {formatPrice(size.riskAmount, currency)}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="text-xs text-[var(--color-text-dim)]">Tamanho da posição</div>
            <div className="num-mono mt-1 text-lg font-semibold text-[var(--color-text)]">
              {formatPrice(size.positionValue, currency)}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="text-xs text-[var(--color-text-dim)]">Unidades</div>
            <div className="num-mono mt-1 text-lg font-semibold text-[var(--color-text)]">
              {size.units.toFixed(6).replace(/\.?0+$/, "")}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="text-xs text-[var(--color-text-dim)]">Distância até o stop</div>
            <div className="num-mono mt-1 text-lg font-semibold text-[var(--color-text)]">
              {size.stopDistancePct.toFixed(2)}%
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-text-dim)]">
          Preencha capital, entrada e stop para calcular o tamanho da posição. Entrada e stop
          precisam ser diferentes.
        </p>
      )}

      {size && (
        <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="text-xs text-[var(--color-text-dim)]">
            Alvo mínimo a {guidance.minRewardRiskRatio}:1 sobre o risco
          </div>
          <div className="num-mono mt-1 text-sm font-medium text-[var(--color-up)]">
            {formatPrice(
              parseNumber(entryPrice)! +
                (parseNumber(entryPrice)! - parseNumber(stopPrice)!) * guidance.minRewardRiskRatio,
              currency,
            )}
          </div>
        </div>
      )}

      <div className="mt-4">
        <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Regras</h4>
        <ul className="flex flex-col gap-1.5">
          {guidance.notes.map((note) => (
            <li
              key={note}
              className="border-l-2 border-[var(--color-border)] pl-3 text-xs leading-relaxed text-[var(--color-text-dim)]"
            >
              {note}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
