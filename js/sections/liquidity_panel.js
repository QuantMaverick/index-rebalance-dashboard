/**
 * Liquidity & TCA distribution panel.
 *
 * Three histograms side-by-side:
 *   1. ADV (60d, log-scale x-axis)
 *   2. Corwin-Schultz spread proxy (bps)
 *   3. Implementation Shortfall — forced-execution cost (bps)
 *
 * Each histogram has a sidebar tile showing median / p25 / p75. Spec
 * mandates the "proxy" framing: every label calls out that these are
 * daily-OHLCV-derived estimates, not real intraday measurements.
 *
 * Outliers in the early years (2010–2012, thin price-cache history)
 * inflate IS values. We winsorize at p99 *for display only* and label
 * the truncation in the chart caption — the underlying data is
 * unchanged in the events JSON.
 *
 * @module sections/liquidity_panel
 */

import { PALETTE, PLOTLY_CONFIG, baseLayout } from "../plotly_theme.js";
import { fmtBpsDirect, fmtUsd } from "../utils/format.js";
import { median, percentile } from "../utils/stats.js";

/**
 * @typedef {object} LiquidityPanelData
 * @property {object} events  — validated EventsFile
 * @property {string} indexLabel
 */

/**
 * @param {string} containerId
 * @param {LiquidityPanelData} data
 */
export function render(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const events = data.events.events || [];
  const liquidities = events
    .map((ev) => ev.liquidity)
    .filter((l) => l != null);
  const tcas = events.map((ev) => ev.tca).filter((t) => t != null);

  if (liquidities.length === 0) {
    el.innerHTML = `
      <div class="text-zinc-500 font-mono text-sm p-4">
        no liquidity data for ${data.indexLabel}.
      </div>
    `;
    return;
  }

  const adv = liquidities.map((l) => l.adv_60d_dollars).filter((x) => x > 0);
  const cs = liquidities
    .map((l) => l.corwin_schultz_spread)
    .filter((x) => Number.isFinite(x) && x > 0);
  const isCost = tcas
    .map((t) => t.forced_execution_cost_bps)
    .filter((x) => Number.isFinite(x) && x > 0);

  // Winsorize IS at p99 for display
  const isP99 = percentile(isCost, 0.99);
  const isDisplay = isCost.map((x) => Math.min(x, isP99));

  el.innerHTML = `
    <div class="grid lg:grid-cols-3 gap-4">
      ${histPanel("ADV (60d, $)", "adv", adv, "logarithmic", fmtUsd)}
      ${histPanel(
        "Corwin-Schultz spread proxy",
        "cs",
        cs.map((x) => x * 1e4),
        "linear",
        (b) => `${b.toFixed(0)} bps`,
      )}
      ${histPanel(
        "Implementation Shortfall (forced)",
        "is",
        isDisplay,
        "linear",
        (b) => `${b.toFixed(0)} bps`,
      )}
    </div>
    <p class="text-xs text-zinc-500 mt-3 max-w-3xl">
      <span class="text-zinc-300 font-semibold">Proxy framing —</span>
      all three metrics are derived from daily OHLCV. Corwin-Schultz is a high-low spread <em>estimator</em>, not a quoted spread; Amihud and Kyle's lambda are similar daily-frequency approximations of intraday liquidity. True execution cost requires tick-level data we don't pay for. Implementation shortfall is winsorized at the 99th percentile (${fmtBpsDirect(isP99)}) for display; underlying data is unchanged.
    </p>
  `;

  renderHist("hist-adv", adv, "logarithmic", PALETTE.teal, "ADV (USD, log scale)");
  renderHist(
    "hist-cs",
    cs.map((x) => x * 1e4),
    "linear",
    PALETTE.amber,
    "spread (bps)",
  );
  renderHist("hist-is", isDisplay, "linear", PALETTE.rose, "forced cost (bps)");
}

/**
 * @param {string} title
 * @param {string} key  — used for div ID suffix
 * @param {number[]} arr
 * @param {"linear"|"logarithmic"} _xType
 * @param {(x: number) => string} fmt
 */
function histPanel(title, key, arr, _xType, fmt) {
  const med = median(arr);
  const p25 = percentile(arr, 0.25);
  const p75 = percentile(arr, 0.75);
  const n = arr.length;
  return `
    <div class="bg-zinc-950/50 border border-zinc-800 rounded p-3">
      <div class="text-zinc-300 font-semibold text-sm mb-2">${title}
        <span class="ml-2 inline-block bg-amber-900/40 text-amber-300 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
          title="Daily-OHLCV-derived proxy. Not a tick-level measurement.">proxy</span>
      </div>
      <div id="hist-${key}" class="h-56"></div>
      <div class="grid grid-cols-3 gap-2 mt-3 text-xs font-mono">
        <div class="text-zinc-500"><div class="text-zinc-600">p25</div><div class="text-zinc-300">${fmt(p25)}</div></div>
        <div class="text-zinc-500"><div class="text-zinc-600">median</div><div class="text-teal-400">${fmt(med)}</div></div>
        <div class="text-zinc-500"><div class="text-zinc-600">p75</div><div class="text-zinc-300">${fmt(p75)}</div></div>
      </div>
      <div class="text-[10px] text-zinc-600 mt-2">n=${n}</div>
    </div>
  `;
}

/**
 * @param {string} elId
 * @param {number[]} arr
 * @param {"linear"|"logarithmic"} xType
 * @param {string} color
 * @param {string} xTitle
 */
function renderHist(elId, arr, xType, color, xTitle) {
  const el = document.getElementById(elId);
  if (!el) return;
  const xs = xType === "logarithmic" ? arr.map((x) => Math.log10(x)) : arr;
  const trace = {
    x: xs,
    type: "histogram",
    marker: { color, line: { color: PALETTE.zincGrid, width: 1 } },
    nbinsx: 30,
    hovertemplate: "<b>%{y}</b> events<extra></extra>",
  };
  const layout = baseLayout();
  layout.margin = { t: 8, r: 12, b: 38, l: 36 };
  layout.bargap = 0.05;
  layout.xaxis.title = {
    text: xType === "logarithmic" ? `log₁₀(${xTitle})` : xTitle,
    font: { size: 9 },
  };
  layout.yaxis.title = { text: "count", font: { size: 9 } };
  layout.showlegend = false;
  Plotly.react(el, [trace], layout, PLOTLY_CONFIG);
}
