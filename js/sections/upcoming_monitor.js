/**
 * Upcoming announcement monitor — card grid.
 *
 * Each card: ticker · action pill · announcement date · effective date ·
 * estimated USD demand (with "estimate" pill + AUM-assumption tooltip
 * per spec) · days-until-effective countdown.
 *
 * Empty state is informative — between announcement cycles the tracker's
 * monitor returns no events, which is normal. Don't make it look like
 * an error.
 *
 * @module sections/upcoming_monitor
 */

import { fmtDate, fmtUsd } from "../utils/format.js";

/**
 * @typedef {object} UpcomingMonitorData
 * @property {object} upcoming  — validated UpcomingEventsFile
 */

/**
 * @param {string} containerId
 * @param {UpcomingMonitorData} data
 */
export function render(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const events = data.upcoming.events || [];

  if (events.length === 0) {
    el.innerHTML = `
      <div class="bg-zinc-950/50 border border-zinc-800 border-dashed rounded p-8 text-center">
        <div class="text-zinc-300 text-base font-mono mb-2">No upcoming events</div>
        <div class="text-zinc-500 text-xs max-w-xl mx-auto">
          Empty between announcement cycles is normal. S&P quarterly reviews land in March / June / September / December; MSCI in February / May / August / November. The
          <a class="underline hover:text-zinc-300" href="https://github.com/QuantMaverick/index-rebalance-tracker">tracker's</a>
          <code class="text-teal-400">monitor</code> command repopulates this file when run on cron.
        </div>
      </div>
    `;
    return;
  }

  const today = new Date();
  el.innerHTML = `
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      ${events.map((ev) => renderCard(ev, today)).join("")}
    </div>
  `;
}

/**
 * @param {object} ev — UpcomingEvent
 * @param {Date} today
 */
function renderCard(ev, today) {
  const eff = ev.effective_date ? new Date(ev.effective_date) : null;
  const days = eff ? Math.ceil((eff.getTime() - today.getTime()) / 86_400_000) : null;
  const countdown =
    days == null
      ? "—"
      : days < 0
        ? `${Math.abs(days)}d ago`
        : days === 0
          ? "today"
          : `T-${days}d`;

  const actionStyle =
    ev.action === "add"
      ? "bg-teal-900/50 text-teal-300 border-teal-800/60"
      : "bg-rose-900/50 text-rose-300 border-rose-800/60";

  const indexLabel = ev.index === "sp500" ? "S&P 500" : "MSCI Singapore";

  const demand = ev.estimated_demand_usd;
  const demandHtml = Number.isFinite(demand)
    ? `
        <div class="mt-2 text-amber-400 font-bold text-base">${fmtUsd(demand)}
          <span class="ml-1 text-[9px] bg-amber-900/40 text-amber-300 px-1 py-0.5 rounded uppercase tracking-wider"
            title="Estimate = passive_AUM × stock_market_cap / index_market_cap. AUM ≈ $6.5T for SP500 (2024). Ignores per-fund tracking-error budgets and rebalancing windows.">est. demand</span>
        </div>
      `
    : `<div class="mt-2 text-zinc-600 text-xs italic">demand estimate unavailable</div>`;

  return `
    <a href="${escapeHtml(ev.source_url || "#")}" target="_blank" rel="noopener"
      class="block bg-zinc-900 border border-zinc-800 rounded p-4 hover:border-zinc-700 transition-colors">
      <div class="flex items-baseline justify-between gap-2 mb-1">
        <span class="text-zinc-100 font-bold text-lg">${escapeHtml(ev.ticker)}</span>
        <span class="border ${actionStyle} text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider">
          ${ev.action}
        </span>
      </div>
      <div class="text-zinc-500 text-[10px] uppercase tracking-wider">${indexLabel}</div>
      ${demandHtml}
      <div class="grid grid-cols-2 gap-2 mt-3 text-xs font-mono">
        <div>
          <div class="text-zinc-600">announced</div>
          <div class="text-zinc-300">${fmtDate(ev.announcement_date)}</div>
        </div>
        <div>
          <div class="text-zinc-600">effective</div>
          <div class="text-zinc-300">${fmtDate(ev.effective_date)}</div>
        </div>
      </div>
      <div class="mt-3 text-xs">
        <span class="font-mono ${days != null && days < 0 ? "text-zinc-500" : days != null && days <= 5 ? "text-rose-400" : "text-teal-400"}">${countdown}</span>
      </div>
    </a>
  `;
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
