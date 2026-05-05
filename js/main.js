/**
 * Entry point. Loads + validates JSON contract, then renders sections.
 *
 * Strict load order per spec:
 *   1. Wait for Plotly to be defined (it's deferred)
 *   2. loadAll(index) — validates schema, throws on shape mismatch
 *   3. Render header + summary + decay chart
 *   4. (later phases) event-study, table, liquidity, upcoming, methodology
 *
 * Errors surface in the UI as a "data file unreachable — retry" banner.
 *
 * @module main
 */

import { isLiveMode, loadAll } from "./data_loader.js";
import * as Header from "./sections/header.js";
import * as SummaryStrip from "./sections/summary_strip.js";
import * as DecayChart from "./sections/decay_chart.js";
import * as EventStudyChart from "./sections/event_study_chart.js";
import * as EventsTable from "./sections/events_table.js";
import * as LiquidityPanel from "./sections/liquidity_panel.js";
import * as UpcomingMonitor from "./sections/upcoming_monitor.js";

/** @type {"sp500" | "msci_sg"} */
let currentIndex = "sp500";

const SECTIONS = {
  header: "header",
  summary: "summary-strip",
  decay: "decay-chart",
  eventStudy: "event-study-chart",
  eventsTable: "events-table",
  liquidityPanel: "liquidity-panel",
  upcomingMonitor: "upcoming-monitor",
};

/**
 * Wait for Plotly's deferred script to define `window.Plotly`.
 * @param {number} [timeoutMs=10_000]
 */
async function waitForPlotly(timeoutMs = 10_000) {
  const start = performance.now();
  while (typeof window.Plotly === "undefined") {
    if (performance.now() - start > timeoutMs) {
      throw new Error("Plotly failed to load within 10s");
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Show a friendly error in every chart container when a data fetch fails.
 * @param {Error} err
 */
function showDataError(err) {
  const msg = `data load failed — ${err.message}`;
  for (const id of Object.values(SECTIONS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.innerHTML = `
      <div class="bg-rose-950/40 border border-rose-800 rounded p-4 text-rose-200 font-mono text-sm">
        <div class="font-bold mb-1">Data file unreachable</div>
        <div class="text-rose-300 text-xs">${escapeHtml(msg)}</div>
        <button onclick="location.reload()"
          class="mt-3 bg-rose-700 hover:bg-rose-600 text-white px-3 py-1.5 rounded text-xs">
          retry
        </button>
      </div>
    `;
  }
}

/** @param {string} s */
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Re-render all sections for a given index.
 * @param {"sp500" | "msci_sg"} index
 */
async function renderIndex(index) {
  currentIndex = index;
  const indexLabel = index === "sp500" ? "S&P 500" : "MSCI Singapore";

  let bundle;
  try {
    bundle = await loadAll(index);
  } catch (err) {
    showDataError(/** @type {Error} */ (err));
    return;
  }

  Header.render(SECTIONS.header, {
    asOf: bundle.decay.as_of,
    index,
    onIndexChange: (newIdx) => renderIndex(newIdx),
  });
  SummaryStrip.render(SECTIONS.summary, {
    decay: bundle.decay,
    tcaSummary: bundle.tcaSummary,
  });
  DecayChart.render(SECTIONS.decay, {
    decay: bundle.decay,
    indexLabel,
  });
  EventStudyChart.render(SECTIONS.eventStudy, {
    events: bundle.events,
    indexLabel,
  });
  EventsTable.render(SECTIONS.eventsTable, {
    events: bundle.events,
    indexLabel,
  });
  LiquidityPanel.render(SECTIONS.liquidityPanel, {
    events: bundle.events,
    indexLabel,
  });
  UpcomingMonitor.render(SECTIONS.upcomingMonitor, {
    upcoming: bundle.upcoming,
  });
}

/** @returns {"sp500" | "msci_sg"} */
function initialIndexFromUrl() {
  if (typeof window === "undefined") return "sp500";
  const params = new URLSearchParams(window.location.search);
  const v = params.get("index");
  if (v === "msci_sg") return "msci_sg";
  return "sp500";
}

(async () => {
  if (isLiveMode()) {
    console.warn("live-fetch mode enabled — JSON sourced from raw.githubusercontent.com");
  }
  await waitForPlotly();
  await renderIndex(initialIndexFromUrl());
})();
