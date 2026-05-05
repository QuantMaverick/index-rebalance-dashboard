/**
 * Summary strip: headline numbers visible above the fold.
 *   - latest cohort's mean CAR (with year)
 *   - total events tracked across all cohorts
 *   - estimated mean annual TCA savings (forced − spread)
 *
 * @module sections/summary_strip
 */

import { fmtBpsDirect, fmtInt, fmtPct } from "../utils/format.js";
import { median } from "../utils/stats.js";

/**
 * @typedef {object} SummaryData
 * @property {object} decay  — DecayFile
 * @property {object} tcaSummary — TCASummaryFile
 */

/**
 * @param {string} containerId
 * @param {SummaryData} data
 */
export function render(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const cohorts = data.decay.cohorts || [];
  const latest = cohorts.length ? cohorts[cohorts.length - 1] : null;
  const totalEvents = cohorts.reduce((s, c) => s + (c.n_events || 0), 0);

  const annual = data.tcaSummary.annual || [];
  // Use median across years — early cohorts have thin price-cache history that
  // inflates the per-event mean impact. Median is robust to those outliers and
  // is the honest summary number.
  const medianForced = median(annual.map((r) => r.mean_forced_bps));
  const medianSavings = median(annual.map((r) => r.mean_savings_bps));

  const allCarsAvg =
    cohorts.length === 0 ? NaN : cohorts.reduce((s, c) => s + c.mean_car, 0) / cohorts.length;

  el.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-sm">
      ${tile(
        "Latest cohort CAR",
        latest ? fmtPct(latest.mean_car) : "—",
        latest ? `cohort ${latest.cohort}, n=${latest.n_events}` : "no data",
        latest && Math.abs(latest.mean_car) < 0.01 ? "text-zinc-400" :
          latest && latest.mean_car > 0 ? "text-teal-400" : "text-rose-400",
      )}
      ${tile(
        "Avg CAR (all cohorts)",
        Number.isFinite(allCarsAvg) ? fmtPct(allCarsAvg) : "—",
        `${cohorts.length} year cohorts`,
        Math.abs(allCarsAvg) < 0.01 ? "text-zinc-400" :
          allCarsAvg > 0 ? "text-teal-400" : "text-rose-400",
      )}
      ${tile(
        "Events tracked",
        fmtInt(totalEvents),
        cohorts.length ? `${cohorts[0].cohort}–${cohorts[cohorts.length - 1].cohort}` : "—",
        "text-zinc-100",
      )}
      ${tile(
        "Median annual savings",
        Number.isFinite(medianSavings) ? fmtBpsDirect(medianSavings) : "—",
        Number.isFinite(medianForced) ? `median forced exec: ${fmtBpsDirect(medianForced)}` : "",
        "text-amber-400",
        true,
      )}
    </div>
  `;
}

/**
 * @param {string} label
 * @param {string} value
 * @param {string} sub
 * @param {string} valueColor
 * @param {boolean} [estimate=false] — show "estimate" pill
 */
function tile(label, value, sub, valueColor, estimate = false) {
  const pill = estimate
    ? `<span class="ml-2 inline-block bg-amber-900/40 text-amber-300 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider" title="Square-root impact model proxy. Not a tick-level measurement.">est.</span>`
    : "";
  return `
    <div class="bg-zinc-900 border border-zinc-800 rounded p-4">
      <div class="text-zinc-500 text-xs uppercase tracking-wider">${label}${pill}</div>
      <div class="text-2xl font-bold ${valueColor} mt-1">${value}</div>
      <div class="text-xs text-zinc-500 mt-1">${sub}</div>
    </div>
  `;
}
