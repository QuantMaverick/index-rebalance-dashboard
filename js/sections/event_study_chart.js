/**
 * Event-study chart: cumulative abnormal return from T-A-5 → T-E+5 with two
 * series (market-model + sector-matched) and ±1 SE shading per series.
 *
 * The tracker emits CAR per WINDOW (4 windows × 2 models = up to 8 rows per
 * event), not daily AR series. We treat the windows as a step function:
 *
 *   day  -5         -1           +5            +10
 *        |          |             |             |
 *        T-A-5     T-A-1        T-E-1         T-E+5
 *        cum=0     cum=pre      cum=pre+main  cum=pre+main+post
 *
 * Cumulative SE is approximated as √(Σ SE²) per the rough independence
 * assumption between non-overlapping windows. This is documented in the
 * chart's caption — recruiters who notice should also notice the caption.
 *
 * @module sections/event_study_chart
 */

import { PALETTE, PLOTLY_CONFIG, baseLayout, withSourceAttribution } from "../plotly_theme.js";
import { mean, sem } from "../utils/stats.js";

/** Tracker's standard windows in cumulative order. */
const WINDOW_ORDER = [
  { label: "[T-A-5, T-A-1]", endDay: -1 },
  { label: "[T-A, T-E-1]", endDay: 5 }, // assumes ~5d T-A→T-E gap
  { label: "[T-E, T-E+5]", endDay: 10 },
];

/**
 * @typedef {object} EventStudyChartData
 * @property {object} events  — validated EventsFile from data_loader
 * @property {string} indexLabel
 */

/**
 * Compute cumulative mean ± SE per model.
 * @param {object[]} events  — events_sp500.json events array
 * @param {"market"|"sector_matched"} model
 * @returns {{day: number[], mean: number[], se: number[], n: number[]}}
 */
function aggregateCumulativeCAR(events, model) {
  // For each window in order, collect every event's CAR for that (window, model)
  const byWindow = new Map(WINDOW_ORDER.map((w) => [w.label, []]));
  for (const ev of events) {
    for (const obs of ev.car_observations || []) {
      if (obs.model !== model) continue;
      const arr = byWindow.get(obs.window_label);
      if (arr && Number.isFinite(obs.car)) arr.push(obs.car);
    }
  }
  // Cumulative mean + variance (Σ SE²) across windows in time order
  const days = [-5, ...WINDOW_ORDER.map((w) => w.endDay)];
  const cumMean = [0];
  const cumVar = [0]; // variance of the SE sum
  const ns = [WINDOW_ORDER.length ? (byWindow.get(WINDOW_ORDER[0].label) ?? []).length : 0];

  let runningMean = 0;
  let runningVar = 0;
  for (const w of WINDOW_ORDER) {
    const arr = byWindow.get(w.label) ?? [];
    const m = mean(arr);
    const s = sem(arr);
    if (Number.isFinite(m)) runningMean += m;
    if (Number.isFinite(s)) runningVar += s * s;
    cumMean.push(runningMean);
    cumVar.push(runningVar);
    ns.push(arr.length);
  }
  return {
    day: days,
    mean: cumMean,
    se: cumVar.map(Math.sqrt),
    n: ns,
  };
}

/**
 * @param {string} containerId
 * @param {EventStudyChartData} data
 */
export function render(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const events = data.events.events || [];

  if (events.length === 0) {
    el.innerHTML = `
      <div class="h-72 flex items-center justify-center text-zinc-500 font-mono text-sm">
        no event observations for ${data.indexLabel}
      </div>
    `;
    return;
  }

  const market = aggregateCumulativeCAR(events, "market");
  const sector = aggregateCumulativeCAR(events, "sector_matched");

  const traces = [];

  // Helper to push (line + ±1 SE band) for one series.
  /**
   * @param {ReturnType<typeof aggregateCumulativeCAR>} series
   * @param {string} name
   * @param {string} color
   * @param {string} fillColor
   */
  function pushSeries(series, name, color, fillColor) {
    const upper = series.mean.map((m, i) => m + series.se[i]);
    const lower = series.mean.map((m, i) => m - series.se[i]);
    traces.push({
      x: series.day,
      y: upper,
      type: "scatter",
      mode: "lines",
      line: { color: "rgba(0,0,0,0)" },
      showlegend: false,
      hoverinfo: "skip",
    });
    traces.push({
      x: series.day,
      y: lower,
      type: "scatter",
      mode: "lines",
      fill: "tonexty",
      fillcolor: fillColor,
      line: { color: "rgba(0,0,0,0)" },
      name: `${name}  ±1 SE`,
      hoverinfo: "skip",
    });
    traces.push({
      x: series.day,
      y: series.mean,
      type: "scatter",
      mode: "lines+markers",
      line: { color, width: 2 },
      marker: { color, size: 7 },
      name,
      customdata: series.n,
      hovertemplate: "<b>day %{x}</b><br>cum CAR=%{y:+.3%}<br>n=%{customdata}<extra></extra>",
    });
  }

  pushSeries(market, "market-model AR", PALETTE.teal, "rgba(20, 184, 166, 0.15)");
  pushSeries(sector, "sector-matched AR", PALETTE.rose, "rgba(244, 63, 94, 0.15)");

  const layout = baseLayout();
  layout.title = {
    text: `${data.indexLabel} cumulative CAR around announcement   <span style="color:${PALETTE.zincSub};font-size:10px">aggregated across ${events.length} events</span>`,
    font: { size: 13, color: PALETTE.zincTxt },
    x: 0.05,
  };
  layout.xaxis.title = { text: "trading day relative to announcement (T-A=0)", font: { size: 11 } };
  layout.xaxis.tickmode = "array";
  layout.xaxis.tickvals = [-5, -1, 5, 10];
  layout.xaxis.ticktext = ["T-A-5", "T-A-1", "T-E-1", "T-E+5"];
  layout.yaxis.title = { text: "cumulative abnormal return", font: { size: 11 } };
  layout.yaxis.tickformat = "+.2%";
  layout.shapes = [
    {
      type: "line",
      x0: -5,
      x1: 10,
      y0: 0,
      y1: 0,
      line: { color: PALETTE.zincSub, width: 1, dash: "dot" },
    },
    {
      type: "line",
      x0: 0,
      x1: 0,
      yref: "paper",
      y0: 0,
      y1: 1,
      line: { color: PALETTE.zincSub, width: 1, dash: "dot" },
    },
  ];
  layout.annotations = [
    {
      x: 0,
      xref: "x",
      y: 1,
      yref: "paper",
      yanchor: "top",
      xanchor: "left",
      text: " announcement",
      showarrow: false,
      font: { color: PALETTE.zincSub, size: 9 },
    },
    {
      x: 5,
      xref: "x",
      y: 1,
      yref: "paper",
      yanchor: "top",
      xanchor: "left",
      text: " effective",
      showarrow: false,
      font: { color: PALETTE.zincSub, size: 9 },
    },
  ];
  withSourceAttribution(
    layout,
    `data: index-rebalance-tracker · ${events.length} events · ±1 SE assumes inter-window independence`,
  );

  Plotly.react(el, traces, layout, PLOTLY_CONFIG);
}
