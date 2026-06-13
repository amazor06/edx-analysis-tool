import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ErrorBar, Cell, ReferenceLine, CartesianGrid,
} from "recharts";
import * as XLSX from "xlsx";
import "./App.css";

/* ── Constants ──────────────────────────────────────────────────────────── */
const M_FE = 55.845;
const M_NB = 92.906;
const calcX = (wFe, wNb) => (wFe / M_FE) * (M_NB / wNb);

/* Short display format: 2 decimal places for clean readability */
const fmtX = (v) => v.toFixed(2);

/* ── Statistics ─────────────────────────────────────────────────────────── */
function stats(vals) {
  if (!vals.length) return { mean: 0, std: 0, min: 0, max: 0, n: 0 };
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  return { mean, std: Math.sqrt(variance), min: Math.min(...vals), max: Math.max(...vals), n };
}

/* ── Histogram binning ──────────────────────────────────────────────────── */
function histogram(vals, binCount = 8) {
  if (vals.length < 2) return vals.map((v) => ({ bin: v.toFixed(4), count: 1 }));
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const range = mx - mn || 1;
  const w = range / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    binStart: mn + i * w, binEnd: mn + (i + 1) * w,
    bin: (mn + (i + 0.5) * w).toFixed(4), count: 0,
  }));
  vals.forEach((v) => { let idx = Math.floor((v - mn) / w); if (idx >= binCount) idx = binCount - 1; bins[idx].count++; });
  return bins;
}

/* ── Sound ──────────────────────────────────────────────────────────────── */
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.5);
    });
  } catch { /* silent */ }
}

/* ── Browser notifications ───────────────────────────────────────────── */
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function sendNotification(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, { body, requireInteraction: true });
      setTimeout(() => n.close(), 15000);
    }
  } catch (e) { /* fallback below */ }
  // Flash the tab title so it's visible in the taskbar/dock
  const original = document.title;
  let flash = true;
  const iv = setInterval(() => {
    document.title = flash ? "⏱ Measurement Complete!" : original;
    flash = !flash;
  }, 800);
  const stop = () => { clearInterval(iv); document.title = original; window.removeEventListener("focus", stop); };
  window.addEventListener("focus", stop);
  setTimeout(stop, 30000);
}

/* ── ID generator ───────────────────────────────────────────────────────── */
let _id = 0;
const uid = () => `${++_id}-${Date.now()}`;

/* ═══════════════════════════════════════════════════════════════════════════
   Timer
   ═══════════════════════════════════════════════════════════════════════════ */
function Timer({ duration, onComplete }) {
  const [remaining, setRemaining] = useState(duration);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const interval = useRef(null);

  useEffect(() => { setRemaining(duration); setRunning(false); setFinished(false); }, [duration]);

  useEffect(() => {
    if (running && remaining > 0) {
      interval.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) { clearInterval(interval.current); setRunning(false); setFinished(true); playChime(); sendNotification("EDX Measurement Complete", "Timer finished — move to the next measurement spot."); onComplete?.(); return 0; }
          return r - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval.current);
  }, [running]);

  const pct = duration > 0 ? ((duration - remaining) / duration) * 100 : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className={`timer-card${finished ? " timer-done" : ""}`}>
      <div className="timer-header">
        <span className="section-label">Measurement Timer</span>
        {finished && <span className="timer-check">✓ Complete</span>}
      </div>
      <div className={`timer-display${remaining < 30 && running ? " timer-warn" : ""}${finished ? " timer-green" : ""}`}>
        {mm}:{ss}
      </div>
      <div className="timer-track"><div className="timer-fill" style={{ width: `${pct}%` }} /></div>
      <div className="timer-btns">
        {!running && !finished && <button className="btn btn-primary btn-sm" onClick={() => { requestNotificationPermission(); setRunning(true); }}>▶ Start</button>}
        {running && <button className="btn btn-danger btn-sm" onClick={() => { clearInterval(interval.current); setRunning(false); }}>⏸ Pause</button>}
        <button className="btn btn-ghost btn-sm" onClick={() => { clearInterval(interval.current); setRunning(false); setFinished(false); setRemaining(duration); }}>↺ Reset</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Spot Table
   ═══════════════════════════════════════════════════════════════════════════ */
function SpotTable({ spots, onDelete }) {
  if (!spots.length) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Spot #</th><th>Fe wt%</th><th>Nb wt%</th><th>x value</th><th>Running Avg</th><th></th>
          </tr>
        </thead>
        <tbody>
          {spots.map((s, i) => {
            const ravg = spots.slice(0, i + 1).reduce((a, b) => a + b.x, 0) / (i + 1);
            return (
              <tr key={s.id} className={i % 2 ? "row-alt" : ""}>
                <td>{i + 1}</td>
                <td className="mono">{s.wFe.toFixed(4)}</td>
                <td className="mono">{s.wNb.toFixed(4)}</td>
                <td className="mono">{s.x.toFixed(4)}</td>
                <td className="mono">{ravg.toFixed(4)}</td>
                <td className="row-del"><button onClick={() => onDelete(s.id)} title="Remove">×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Histogram
   ═══════════════════════════════════════════════════════════════════════════ */
function Histogram({ xValues, st }) {
  if (xValues.length < 2) return null;
  const bins = histogram(xValues, Math.min(10, Math.max(3, Math.ceil(Math.sqrt(xValues.length)))));
  return (
    <div className="chart-block">
      <div className="section-label">Distribution of x values</div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
          <XAxis dataKey="bin" tick={{ fontSize: 10 }} label={{ value: "x value", position: "insideBottom", offset: -14, fontSize: 11, fill: "var(--text-sec)" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} label={{ value: "Count", angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--text-sec)" }} />
          <Tooltip formatter={(v) => [v, "Count"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="var(--chart-blue)" />
          {st.n > 1 && <ReferenceLine x={st.mean.toFixed(4)} stroke="var(--red)" strokeDasharray="4 4" label={{ value: "μ", position: "top", fontSize: 12, fill: "var(--red)" }} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Cross-sample comparison chart
   ═══════════════════════════════════════════════════════════════════════════ */
function SummaryChart({ samples }) {
  const data = samples.filter((s) => s.spots.length).map((s) => {
    const st = stats(s.spots.map((p) => p.x));
    return { name: s.name || `#${s.number}`, mean: +st.mean.toFixed(4), std: +st.std.toFixed(4) };
  });
  if (data.length < 2) return null;
  return (
    <div className="chart-block">
      <div className="section-label">Mean ± σ across samples</div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 10, right: 8, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} label={{ value: "x", angle: -90, position: "insideLeft", fontSize: 12, fill: "var(--text-sec)" }} />
          <Tooltip formatter={(v, n) => [v, n === "mean" ? "Mean x" : n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Bar dataKey="mean" fill="var(--chart-blue)" radius={[4, 4, 0, 0]}>
            <ErrorBar dataKey="std" width={6} strokeWidth={2} stroke="var(--text)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Export helpers
   ═══════════════════════════════════════════════════════════════════════════ */
function exportCSV(samples) {
  let csv = "Sample Number,Sample Name,Spot #,Fe wt%,Nb wt%,x value\n";
  samples.forEach((s) => s.spots.forEach((p, i) => { csv += `${s.number},"${s.name || ""}",${i + 1},${p.wFe},${p.wNb},${p.x}\n`; }));
  csv += "\nSample Number,Sample Name,n,Mean x,Std Dev,Min x,Max x\n";
  samples.forEach((s) => {
    if (!s.spots.length) return;
    const st = stats(s.spots.map((p) => p.x));
    csv += `${s.number},"${s.name || ""}",${st.n},${st.mean.toFixed(4)},${st.std.toFixed(4)},${st.min.toFixed(4)},${st.max.toFixed(4)}\n`;
  });
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "edx_results.csv"; a.click();
}

function exportExcel(samples) {
  const spots = [], summary = [];
  samples.forEach((s) => {
    s.spots.forEach((p, i) => spots.push({ "Sample #": s.number, "Sample Name": s.name || "", "Spot #": i + 1, "Fe wt%": p.wFe, "Nb wt%": p.wNb, "x value": +p.x.toFixed(4) }));
    if (s.spots.length) {
      const st = stats(s.spots.map((p) => p.x));
      summary.push({ "Sample #": s.number, "Sample Name": s.name || "", n: st.n, "Mean x": +st.mean.toFixed(4), "Std Dev": +st.std.toFixed(4), "Min x": +st.min.toFixed(4), "Max x": +st.max.toFixed(4), Composition: `Fe_${fmtX(st.mean)}NbS2` });
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(spots), "Spot Data");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
  XLSX.writeFile(wb, "edx_results.xlsx");
}

function buildHistogramSVG(xValues, st, width = 420, height = 200) {
  if (xValues.length < 2) return "";
  const binCount = Math.min(10, Math.max(3, Math.ceil(Math.sqrt(xValues.length))));
  const bins = histogram(xValues, binCount);
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const pad = { top: 25, right: 15, bottom: 40, left: 40 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const barW = cw / bins.length - 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family:'Helvetica Neue',Arial,sans-serif">`;
  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i;
    svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#e5e7eb" stroke-dasharray="3 3"/>`;
  }
  // Bars
  bins.forEach((b, i) => {
    const barH = (b.count / maxCount) * ch;
    const x = pad.left + i * (cw / bins.length) + 1;
    const y = pad.top + ch - barH;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#5B8BD4" rx="3"/>`;
    if (bins.length <= 12) {
      svg += `<text x="${x + barW / 2}" y="${height - pad.bottom + 14}" text-anchor="middle" font-size="8" fill="#666">${b.bin}</text>`;
    }
  });
  // Mean line
  if (st.n > 1) {
    const meanPos = pad.left + ((st.mean - bins[0].binStart) / (bins[bins.length - 1].binEnd - bins[0].binStart)) * cw;
    if (meanPos >= pad.left && meanPos <= width - pad.right) {
      svg += `<line x1="${meanPos}" y1="${pad.top}" x2="${meanPos}" y2="${pad.top + ch}" stroke="#C0392B" stroke-width="1.5" stroke-dasharray="4 4"/>`;
      svg += `<text x="${meanPos + 4}" y="${pad.top + 12}" font-size="10" fill="#C0392B" font-weight="600">μ = ${st.mean.toFixed(4)}</text>`;
    }
  }
  // Y-axis labels
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxCount / 4) * (4 - i));
    const y = pad.top + (ch / 4) * i;
    svg += `<text x="${pad.left - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#888">${val}</text>`;
  }
  // Axis labels
  svg += `<text x="${pad.left + cw / 2}" y="${height - 4}" text-anchor="middle" font-size="10" fill="#666">x value</text>`;
  svg += `<text x="12" y="${pad.top + ch / 2}" text-anchor="middle" font-size="10" fill="#666" transform="rotate(-90,12,${pad.top + ch / 2})">Count</text>`;
  svg += `</svg>`;
  return svg;
}

function buildSummaryChartSVG(samples, width = 420, height = 200) {
  const data = samples.filter((s) => s.spots.length).map((s) => {
    const st = stats(s.spots.map((p) => p.x));
    return { name: s.name || `#${s.number}`, mean: st.mean, std: st.std };
  });
  if (data.length < 2) return "";
  const pad = { top: 25, right: 15, bottom: 40, left: 50 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const maxVal = Math.max(...data.map((d) => d.mean + d.std)) * 1.15 || 1;
  const barW = Math.min(40, cw / data.length - 10);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family:'Helvetica Neue',Arial,sans-serif">`;
  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i;
    const val = (maxVal * (4 - i) / 4).toFixed(2);
    svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#e5e7eb" stroke-dasharray="3 3"/>`;
    svg += `<text x="${pad.left - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#888">${val}</text>`;
  }
  data.forEach((d, i) => {
    const x = pad.left + (i + 0.5) * (cw / data.length) - barW / 2;
    const barH = (d.mean / maxVal) * ch;
    const y = pad.top + ch - barH;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#5B8BD4" rx="3"/>`;
    // Error bar
    if (d.std > 0) {
      const cx = x + barW / 2;
      const errTop = pad.top + ch - ((d.mean + d.std) / maxVal) * ch;
      const errBot = pad.top + ch - ((d.mean - d.std) / maxVal) * ch;
      svg += `<line x1="${cx}" y1="${errTop}" x2="${cx}" y2="${errBot}" stroke="#1a1d23" stroke-width="2"/>`;
      svg += `<line x1="${cx - 5}" y1="${errTop}" x2="${cx + 5}" y2="${errTop}" stroke="#1a1d23" stroke-width="2"/>`;
      svg += `<line x1="${cx - 5}" y1="${errBot}" x2="${cx + 5}" y2="${errBot}" stroke="#1a1d23" stroke-width="2"/>`;
    }
    svg += `<text x="${x + barW / 2}" y="${height - pad.bottom + 14}" text-anchor="middle" font-size="9" fill="#666">${d.name}</text>`;
  });
  svg += `<text x="14" y="${pad.top + ch / 2}" text-anchor="middle" font-size="10" fill="#666" transform="rotate(-90,14,${pad.top + ch / 2})">x value</text>`;
  svg += `</svg>`;
  return svg;
}

function printReport(samples) {
  const w = window.open("", "_blank");
  const now = new Date().toLocaleString();
  let h = `<!DOCTYPE html><html><head><title>EDX Report</title><style>
    body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1d23;margin:40px;font-size:12px}
    h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;margin-top:28px;border-bottom:2px solid #3366CC;padding-bottom:4px}
    h3{font-size:13px;margin-top:18px;color:#555}
    .meta{color:#666;font-size:11px;margin-bottom:20px}
    table{border-collapse:collapse;width:100%;margin:12px 0}
    th{background:#3366CC;color:#fff;padding:8px 12px;text-align:left;font-size:11px}
    td{padding:6px 12px;border-bottom:1px solid #ddd;font-family:'Courier New',monospace;font-size:11px}
    tr:nth-child(even){background:#f7f9fc}
    .sg{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
    .sb{background:#f8f9fb;padding:8px 12px;border-radius:6px}
    .sb .l{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px}
    .sb .v{font-size:16px;font-weight:600;font-family:'Courier New',monospace}
    .comp{font-size:14px;font-weight:600;margin:8px 0}
    .chart{margin:16px 0;text-align:center}
    .pb{page-break-before:always}
    @media print{body{margin:20px}}
  </style></head><body>`;
  h += `<h1>EDX Fe Concentration Report for Fe<sub>x</sub>NbS<sub>2</sub> Samples</h1><div class="meta">Generated: ${now} · ${samples.length} sample(s)</div>`;
  h += `<h2>Summary</h2><table><tr><th>Sample</th><th>Name</th><th>n</th><th>Mean x</th><th>Std Dev</th><th>Min</th><th>Max</th><th>Composition</th></tr>`;
  samples.forEach((s) => { if (!s.spots.length) return; const st = stats(s.spots.map((p) => p.x)); h += `<tr><td>${s.number}</td><td>${s.name || "—"}</td><td>${st.n}</td><td>${st.mean.toFixed(4)}</td><td>${st.std.toFixed(4)}</td><td>${st.min.toFixed(4)}</td><td>${st.max.toFixed(4)}</td><td>Fe<sub>${fmtX(st.mean)}</sub>NbS<sub>2</sub></td></tr>`; });
  h += `</table>`;
  // Summary chart
  const summSVG = buildSummaryChartSVG(samples);
  if (summSVG) { h += `<h3>Mean ± σ Across Samples</h3><div class="chart">${summSVG}</div>`; }
  // Per-sample details
  samples.forEach((s, si) => {
    if (!s.spots.length) return;
    const st = stats(s.spots.map((p) => p.x));
    h += `<div class="${si > 0 ? "pb" : ""}"><h2>Sample ${s.number}${s.name ? ` — ${s.name}` : ""}</h2>`;
    if (s.operator) h += `<div class="meta">Operator: ${s.operator}</div>`;
    h += `<div class="sg"><div class="sb"><div class="l">Mean x</div><div class="v">${fmtX(st.mean)}</div></div><div class="sb"><div class="l">Std Dev</div><div class="v">${fmtX(st.std)}</div></div><div class="sb"><div class="l">Min / Max</div><div class="v">${fmtX(st.min)} / ${fmtX(st.max)}</div></div><div class="sb"><div class="l">Points</div><div class="v">${st.n}</div></div></div>`;
    h += `<div class="comp">Composition: Fe<sub>${fmtX(st.mean)}</sub>NbS<sub>2</sub>${st.n > 1 ? ` ± ${fmtX(st.std)}` : ""}</div>`;
    // Histogram
    const histSVG = buildHistogramSVG(s.spots.map((p) => p.x), st);
    if (histSVG) { h += `<h3>Distribution of x Values</h3><div class="chart">${histSVG}</div>`; }
    // Spot table
    h += `<table><tr><th>Spot #</th><th>Fe wt%</th><th>Nb wt%</th><th>x value</th><th>Running Avg</th></tr>`;
    s.spots.forEach((p, i) => { const ra = s.spots.slice(0, i + 1).reduce((a, b) => a + b.x, 0) / (i + 1); h += `<tr><td>${i + 1}</td><td>${p.wFe.toFixed(4)}</td><td>${p.wNb.toFixed(4)}</td><td>${p.x.toFixed(4)}</td><td>${ra.toFixed(4)}</td></tr>`; });
    h += `</table></div>`;
  });
  h += `</body></html>`;
  w.document.write(h); w.document.close(); w.onload = () => w.print();
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main App
   ═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [samples, setSamples] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [wFe, setWFe] = useState("");
  const [wNb, setWNb] = useState("");
  const [newNum, setNewNum] = useState("1");
  const [newName, setNewName] = useState("");
  const [newOp, setNewOp] = useState("");
  const [newTimerMin, setNewTimerMin] = useState("2");
  const [newTimerSec, setNewTimerSec] = useState("30");
  const [showNew, setShowNew] = useState(true);
  const [status, setStatus] = useState("Ready — create a sample to begin.");
  const [timerKey, setTimerKey] = useState(0);

  const feRef = useRef(null);
  const nbRef = useRef(null);

  useEffect(() => { requestNotificationPermission(); }, []);

  const active = useMemo(() => samples.find((s) => s.id === activeId), [samples, activeId]);
  const st = useMemo(() => (active ? stats(active.spots.map((p) => p.x)) : null), [active]);
  const hasData = samples.some((s) => s.spots.length > 0);

  const addSample = () => {
    if (!newNum.trim()) return;
    const s = {
      id: uid(), number: newNum.trim(), name: newName.trim(), operator: newOp.trim(),
      timerDuration: (parseInt(newTimerMin) || 0) * 60 + (parseInt(newTimerSec) || 0),
      spots: [], created: new Date().toLocaleString(),
    };
    setSamples((p) => [...p, s]);
    setActiveId(s.id); setShowNew(false);
    setNewNum(String((parseInt(newNum) || 0) + 1)); setNewName("");
    setStatus(`Sample ${s.number} created. Enter spot measurements.`);
    setTimeout(() => feRef.current?.focus(), 80);
  };

  const addSpot = () => {
    const fe = parseFloat(wFe), nb = parseFloat(wNb);
    if (isNaN(fe) || isNaN(nb) || fe <= 0 || nb <= 0) { setStatus("Fe and Nb must be positive numbers."); return; }
    const x = calcX(fe, nb);
    setSamples((p) => p.map((s) => s.id === activeId ? { ...s, spots: [...s.spots, { id: uid(), wFe: fe, wNb: nb, x }] } : s));
    setWFe(""); setWNb(""); setTimerKey((k) => k + 1);
    setStatus(`Spot ${(active?.spots.length || 0) + 1} recorded — x = ${fmtX(x)}`);
    setTimeout(() => feRef.current?.focus(), 50);
  };

  const deleteSpot = (spotId) => {
    setSamples((p) => p.map((s) => s.id === activeId ? { ...s, spots: s.spots.filter((sp) => sp.id !== spotId) } : s));
    setStatus("Spot removed.");
  };

  const deleteSample = (sid) => {
    setSamples((p) => p.filter((s) => s.id !== sid));
    if (activeId === sid) { setActiveId(null); setShowNew(true); }
    setStatus("Sample deleted.");
  };

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <h1>EDX Composition Analyzer</h1>
          <span className="header-sub">Fe<sub>x</sub>NbS<sub>2</sub> concentration analysis</span>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => exportCSV(samples)} disabled={!hasData}>CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportExcel(samples)} disabled={!hasData}>Excel</button>
          <button className="btn btn-primary btn-sm" onClick={() => printReport(samples)} disabled={!hasData}>PDF Report</button>
        </div>
      </header>

      <div className="body">
        {/* ── Left: Sample List ── */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <span className="section-label">Samples</span>
            <button className="btn-icon" onClick={() => setShowNew(true)}>+</button>
          </div>
          <div className="sample-list">
            {samples.map((s) => {
              const sst = stats(s.spots.map((p) => p.x));
              const isActive = s.id === activeId;
              return (
                <div key={s.id} className={`sample-item${isActive ? " active" : ""}`} onClick={() => { setActiveId(s.id); setShowNew(false); }}>
                  <div className="sample-item-top">
                    <span className="sample-item-label">#{s.number}{s.name ? ` ${s.name}` : ""}</span>
                    <button className="btn-x" onClick={(e) => { e.stopPropagation(); deleteSample(s.id); }}>×</button>
                  </div>
                  <div className="sample-item-meta">
                    {s.spots.length} spot{s.spots.length !== 1 ? "s" : ""}
                    {sst.n > 0 && ` · x̄ = ${fmtX(sst.mean)}`}
                  </div>
                </div>
              );
            })}
            {!samples.length && <div className="empty-msg">No samples yet</div>}
          </div>
        </aside>

        {/* ── Center: Workspace ── */}
        <main className="workspace">
          {showNew || !active ? (
            <div className="new-sample-form">
              <h2>New Sample</h2>
              <div className="form-card">
                <div className="form-row">
                  <label>
                    <span className="field-label">Sample Number</span>
                    <input value={newNum} onChange={(e) => setNewNum(e.target.value)} placeholder="e.g. 1" />
                  </label>
                  <label style={{ flex: 2 }}>
                    <span className="field-label">Sample Name <span className="optional">(optional)</span></span>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Batch A" />
                  </label>
                </div>
                <label>
                  <span className="field-label">Operator <span className="optional">(optional)</span></span>
                  <input value={newOp} onChange={(e) => setNewOp(e.target.value)} placeholder="e.g. J. Smith" />
                </label>
                <div>
                  <span className="field-label">Measurement Timer</span>
                  <div className="timer-inputs">
                    <input type="number" value={newTimerMin} onChange={(e) => setNewTimerMin(e.target.value)} className="timer-input" /><span className="unit">min</span>
                    <input type="number" value={newTimerSec} onChange={(e) => setNewTimerSec(e.target.value)} className="timer-input" /><span className="unit">sec</span>
                  </div>
                </div>
                <button className="btn btn-primary btn-lg" onClick={addSample} disabled={!newNum.trim()} onKeyDown={(e) => e.key === "Enter" && addSample()}>Create Sample</button>
              </div>
            </div>
          ) : (
            <>
              <div className="ws-header">
                <div>
                  <h2>Sample #{active.number}{active.name ? ` — ${active.name}` : ""}</h2>
                  <p className="ws-meta">
                    {active.operator && `Operator: ${active.operator}  ·  `}
                    {active.spots.length} spot{active.spots.length !== 1 ? "s" : ""} collected
                  </p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(true)}>+ New Sample</button>
              </div>

              <div className="entry-row">
                <div className="entry-card">
                  <div className="section-label">Add Spot #{active.spots.length + 1}</div>
                  <div className="entry-fields">
                    <label>
                      <span className="field-label">Fe wt%</span>
                      <input ref={feRef} type="number" value={wFe} onChange={(e) => setWFe(e.target.value)}
                        placeholder="0.0000" onKeyDown={(e) => { if (e.key === "Enter") nbRef.current?.focus(); }} />
                    </label>
                    <label>
                      <span className="field-label">Nb wt%</span>
                      <input ref={nbRef} type="number" value={wNb} onChange={(e) => setWNb(e.target.value)}
                        placeholder="0.0000" onKeyDown={(e) => { if (e.key === "Enter") addSpot(); }} />
                    </label>
                    <button className="btn btn-success" onClick={addSpot}>Add</button>
                  </div>
                  <p className="entry-hint">Enter → tab to Nb → Enter → adds spot</p>
                </div>
                {active.timerDuration > 0 && (
                  <Timer key={timerKey} duration={active.timerDuration} onComplete={() => setStatus("Timer complete — enter data and move to next spot.")} />
                )}
              </div>

              <SpotTable spots={active.spots} onDelete={deleteSpot} />
            </>
          )}
        </main>

        {/* ── Right: Stats ── */}
        {active && active.spots.length > 0 && (
          <aside className="stats-panel">
            <div className="section-label">Statistics — Sample #{active.number}</div>
            <div className="stat-grid">
              <div className="stat-box"><div className="stat-label">Mean x</div><div className="stat-value accent">{fmtX(st.mean)}</div></div>
              <div className="stat-box"><div className="stat-label">Std Dev</div><div className="stat-value">{fmtX(st.std)}</div></div>
              <div className="stat-box"><div className="stat-label">Min</div><div className="stat-value green">{fmtX(st.min)}</div></div>
              <div className="stat-box"><div className="stat-label">Max</div><div className="stat-value orange">{fmtX(st.max)}</div></div>
              <div className="stat-box"><div className="stat-label">n</div><div className="stat-value">{st.n}</div></div>
            </div>
            <div className="comp-card">
              <div className="comp-label">Composition</div>
              <div className="comp-value">Fe<sub>{fmtX(st.mean)}</sub>NbS<sub>2</sub></div>
              {st.n > 1 && <div className="comp-unc">± {fmtX(st.std)} (1σ, n={st.n})</div>}
            </div>
            <Histogram xValues={active.spots.map((p) => p.x)} st={st} />
            <SummaryChart samples={samples} />
          </aside>
        )}
      </div>

      {/* ── Status bar ── */}
      <footer className="status-bar">{status}</footer>
    </div>
  );
}
