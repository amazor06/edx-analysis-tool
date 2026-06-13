# EDX Composition Analyzer

A React-based tool for analyzing EDX weight-percentage data and calculating Fe concentration in Fe<sub>x</sub>NbS<sub>2</sub> samples.

## Formula

```
x = (w_Fe / 55.845) × (92.906 / w_Nb)
```

## Features

- **Flexible measurements** — any number of spots per sample, no hardcoded limits
- **Live statistics** — mean, standard deviation, min, max, and n update in real time
- **Histogram** — distribution of x values plotted per sample
- **Cross-sample comparison** — mean ± σ bar chart when multiple samples exist
- **Measurement timer** — configurable countdown with chime sound and macOS notification
- **PDF report** — print-ready page with summary table and per-sample detail
- **Excel export** — multi-sheet workbook (Spot Data + Summary)
- **CSV export** — spot-level data plus summary statistics

## Setup

Requires [Node.js](https://nodejs.org/) (install with `brew install node` on macOS if needed).

```bash
npm create vite@latest edx-analyzer -- --template react
cd edx-analyzer
npm install
npm install recharts xlsx
```

Copy `App.jsx` and `App.css` into the `src/` directory:

```bash
cp App.jsx src/App.jsx
cp App.css src/App.css
```

## Usage

```bash
cd edx-analyzer
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173). Your browser will ask to allow notifications on first use — accept to get timer alerts when the app isn't in focus.

## Keyboard Shortcuts

- **Enter** in Fe field → jumps to Nb field
- **Enter** in Nb field → adds the spot

## Other Tools

- `Synthesis.py` — calculates masses of Fe, Nb, and S needed for a given Fe concentration and total sample mass