// Explain the Model: three sections that teach linear regression, random forests and gradient boosting.
// Every number shown comes from outputs/<key>.json (or the m10.js helpers). Nothing is retrained or invented.
import * as m10 from "./m10.js";

const LABELS = { glucose: "Fasting glucose", sbp: "Systolic blood pressure", fev1: "Lung function (FEV₁)" };
const SHORT = { glucose: "Fasting glucose", sbp: "Systolic blood pressure", fev1: "FEV₁" };
const state = { key: "glucose", person: "P1", values: null, edited: false, nTrees: 10, tree: 0, round: 1, showSlow: false };
const $ = (id) => document.getElementById(id);
// toFixed rounds the exact stored value (matches the course's check.md), then add thousands separators
const fmt = (v, d = 1) => { const [i, f] = Math.abs(Number(v)).toFixed(d).split("."); return (Number(v) < 0 && Number((Math.abs(v)).toFixed(d)) !== 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : ""); };
const signed = (v, d = 1) => (v >= 0 ? "+" : "−") + fmt(Math.abs(v), d);
const clsOf = (v) => (v >= 0 ? "up" : "down");

function section() {
  const s = location.hash.slice(1);
  return ["linear", "forest", "boosting"].includes(s) ? s : "linear";
}

// ---------------------------------------------------------------- setup
async function setup() {
  $("dataset").innerHTML = m10.DATASETS.map((k) => `<option value="${k}">${LABELS[k]}</option>`).join("");
  $("dataset").onchange = async (e) => { state.key = e.target.value; state.person = "P1"; await loadPeople(); render(); };
  $("person").onchange = (e) => { state.person = e.target.value; resetPerson(); render(); };
  window.onhashchange = () => { render(); window.scrollTo(0, 0); };
  await loadPeople();
  render();
}

function resetPerson() { state.values = null; state.edited = false; state.tree = 0; }

async function loadPeople() {
  const b = await m10.loadBundle(state.key);
  $("person").innerHTML = b.people.map((p) => `<option value="${p.id}">${p.label}: ${p.description}</option>`).join("");
  $("person").value = state.person;
  resetPerson();
}

async function render() {
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.hash === "#" + section()));
  const b = await m10.loadBundle(state.key);
  const person = b.people.find((p) => p.id === state.person);
  if (!state.values) state.values = { ...person.values };
  $("person-line").innerHTML = `${person.label}: ${person.description} (picked as a "${person.why_chosen}" example).
    Measured ${b.target_label.toLowerCase()}: <b class="obs">${fmt(person.observed)} ${b.units}</b>. The models never saw this person while learning.`;
  ({ linear: renderLinear, forest: renderForest, boosting: renderBoosting })[section()](b, person);
}

const featureLabel = (b, name) => (b.features.find((f) => f.name === name) || { label: name }).label;
const featureUnits = (b, name) => (b.features.find((f) => f.name === name) || { units: "" }).units;
const groupOf = (b, name) => b.categorical_groups.find((g) => g.name === name);
const step = (n, title, body) => `<section class="step"><h3><span class="n">${n}</span>${title}</h3>${body}</section>`;

// ---------------------------------------------------------------- tiny chart kit (inline SVG)
function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const e = raw / mag;
  const st = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-6; v += st) out.push(Number(v.toFixed(10)));
  return out;
}
function frame({ W = 680, H = 280, padL = 64, padR = 16, padT = 16, padB = 46, xMin, xMax, yMin, yMax, xLabel, yLabel, xTicks, yTicks, xFmt = (v) => fmt(v, 0), yFmt = (v) => fmt(v, 0), xGrid = false }) {
  const x = (v) => padL + ((v - xMin) / (xMax - xMin || 1)) * (W - padL - padR);
  const y = (v) => H - padB - ((v - yMin) / (yMax - yMin || 1)) * (H - padT - padB);
  const yt = (yTicks || niceTicks(yMin, yMax)).filter((v) => v >= yMin - 1e-9 && v <= yMax + 1e-9);
  const xt = xTicks === null ? [] : (xTicks || niceTicks(xMin, xMax)).filter((v) => v >= xMin - 1e-9 && v <= xMax + 1e-9);
  const axes = `
    ${yt.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>
      <text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${yFmt(v)}</text>`).join("")}
    ${xt.map((v) => `${xGrid ? `<line x1="${x(v)}" x2="${x(v)}" y1="${padT}" y2="${H - padB}" stroke="var(--line)"/>` : ""}
      <text x="${x(v)}" y="${H - padB + 16}" text-anchor="middle">${xFmt(v)}</text>`).join("")}
    <line x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}" stroke="var(--muted)"/>
    <text x="${(padL + W - padR) / 2}" y="${H - 6}" text-anchor="middle" class="lbl">${xLabel || ""}</text>
    <text transform="translate(14 ${(padT + H - padB) / 2}) rotate(-90)" text-anchor="middle" class="lbl">${yLabel || ""}</text>`;
  const wrap = (inner, aria) => `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria || ""}">${axes}${inner}</svg>`;
  return { x, y, wrap, W, H, padL, padR, padT, padB };
}
const pathOf = (pts, fx, fy) => pts.map(([a, v], i) => `${i ? "L" : "M"}${fx(a).toFixed(1)},${fy(v).toFixed(1)}`).join("");
const legend = (items) => `<p class="note">${items.map(([c, t, dash]) =>
  `<span style="white-space:nowrap"><svg width="22" height="10" style="display:inline;width:22px;vertical-align:middle"><line x1="0" x2="22" y1="5" y2="5" stroke="${c}" stroke-width="3" ${dash ? 'stroke-dasharray="4 3"' : ""}/></svg> ${t}</span>`).join(" &nbsp; ")}</p>`;
const pad = (lo, hi, f = 0.08) => { const s = (hi - lo) || Math.abs(hi) || 1; return [lo - s * f, hi + s * f]; };

// =====================================================================================
// 1. PUSH & PULL (linear regression)
// =====================================================================================
function renderLinear(b, person) {
  $("section").innerHTML = `
    <h2>Push &amp; Pull</h2>
    <p class="question">Which features push a prediction up or down, and by how much?</p>
    <div class="goal"><b>What you'll be able to do:</b> rebuild a linear regression prediction by hand from a starting point plus
      one signed push per feature, and explain why a feature's <i>coefficient</i> is not the same thing as its <i>push</i> for one person.</div>
    <div id="lin-s1"></div>
    <section class="step"><h3><span class="n">2</span><span id="lin-s2-title"></span></h3>
      <p>Each feature then moves the prediction up or down. Its <b>push</b> is
        <b>coefficient × (this person's value − training average)</b>. Above-average values push one way, below-average values push the other.</p>
      <div class="panel">
        <p class="note"><b>Try it:</b> change any value and watch the bars below move. The coefficients never change; only the distance from the training average does, so only the pushes change.</p>
        <div class="inputs" id="lin-inputs"></div>
        <div class="btnrow"><button class="btn" id="lin-reset">Reset to ${person.label}</button></div>
      </div>
      <div id="lin-chart"></div>
    </section>
    <div id="lin-rest"></div>
    <div id="lin-general"></div>`;
  drawLinearInputs(b);
  $("lin-reset").onclick = () => { state.values = { ...person.values }; state.edited = false; drawLinearInputs(b); drawLinearBody(b, person); };
  drawLinearBody(b, person);
  drawLinearGeneral(b);
}

function drawLinearInputs(b) {
  const groups = b.categorical_groups;
  const grouped = new Set(groups.flatMap((g) => g.levels.filter((lv) => lv.column).map((lv) => lv.column)));
  const numeric = b.features.filter((f) => !grouped.has(f.name));
  $("lin-inputs").innerHTML = numeric.map((f) => {
    const s = b.feature_stats[f.name];
    return `<label>${f.label} (${f.units})<input type="number" data-f="${f.name}" value="${state.values[f.name]}" min="${s.min}" max="${s.max}" step="any"></label>`;
  }).join("") + groups.map((g) => `<label>${g.label}<select data-g="${g.name}">${g.levels
    .map((lv) => `<option ${lv.label === m10.categoryOf(b, g.name, state.values) ? "selected" : ""}>${lv.label}</option>`).join("")}</select></label>`).join("");
  const person = b.people.find((p) => p.id === state.person);
  document.querySelectorAll("[data-f]").forEach((el) => (el.oninput = () => {
    if (el.value === "" || isNaN(Number(el.value))) return;
    state.values[el.dataset.f] = Number(el.value); state.edited = true; drawLinearBody(b, person);
  }));
  document.querySelectorAll("[data-g]").forEach((el) => (el.onchange = () => {
    Object.assign(state.values, m10.categoryInputs(b, el.dataset.g, el.value)); state.edited = true; drawLinearBody(b, person);
  }));
}

function linearRows(b, ex) {
  // One row per numeric feature and one per category group (sex, ethnicity), in model order.
  const lin = b.linear, v = state.values, rows = [], seen = new Set();
  for (const f of b.features) {
    const g = b.categorical_groups.find((g) => g.levels.some((lv) => lv.column === f.name));
    if (g) {
      if (seen.has(g.name)) continue;
      seen.add(g.name);
      const level = m10.categoryOf(b, g.name, v);
      const col = (g.levels.find((lv) => lv.label === level) || {}).column;
      rows.push({ name: g.name, label: g.label, value: level, group: g, levelCol: col, coef: col ? lin.coefficients[col] : 0, push: ex.groupedPushes[g.name] });
    } else {
      rows.push({ name: f.name, label: f.label, units: f.units, value: v[f.name], ref: lin.reference[f.name], coef: lin.coefficients[f.name], push: ex.groupedPushes[f.name] });
    }
  }
  return rows;
}

function drawLinearBody(b, person) {
  const u = b.units, lin = b.linear;
  const ex = m10.linearExplain(b, state.values);
  const rows = linearRows(b, ex);
  const biggestUp = rows.filter((r) => r.push > 0).sort((a, c) => c.push - a.push)[0];
  const biggestDown = rows.filter((r) => r.push < 0).sort((a, c) => a.push - c.push)[0];
  const who = state.edited ? "your edited person" : person.label;
  const showObs = !state.edited;
  const err = ex.prediction - person.observed;
  const farOff = showObs && Math.abs(err) > 0.25 * Math.abs(person.observed);

  // Waterfall chart: start → one push per feature → prediction
  let run = ex.baseline;
  const bars = rows.map((r) => { const from = run; run += r.push; return { ...r, from, to: run }; });
  const vals = [ex.baseline, ex.prediction, ...bars.map((r) => r.to)].concat(showObs ? [person.observed] : []);
  const [yMin, yMax] = pad(Math.min(...vals), Math.max(...vals), 0.15);
  const n = rows.length + 2;
  const fr = frame({ W: 720, H: 330, padB: 70, xMin: 0, xMax: n, yMin, yMax, xTicks: null, yLabel: `${SHORT[state.key]} (${u})` });
  const cx = (i) => fr.x(i + 0.5), bw = Math.min(56, (fr.W - fr.padL - fr.padR) / n * 0.6);
  const shortLines = (s) => {
    const base = s.split(" (")[0].replace("Race / ethnicity", "Race/ethnicity").replace("Family income ÷ poverty line", "Income ratio");
    const words = base.split(" "); const lines = [""];
    for (const w of words) { if ((lines[lines.length - 1] + " " + w).trim().length > 11 && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + " " + w).trim(); }
    return lines.slice(0, 2);
  };
  const tick = (x, label) => shortLines(label).map((l, j) => `<text x="${x}" y="${fr.H - fr.padB + 16 + j * 14}" text-anchor="middle">${l}</text>`).join("");
  let inner = "";
  inner += `<line x1="${cx(0) - bw / 2}" x2="${cx(0) + bw / 2}" y1="${fr.y(ex.baseline)}" y2="${fr.y(ex.baseline)}" stroke="var(--fg)" stroke-width="4"/>
    <text x="${cx(0)}" y="${fr.y(ex.baseline) - 8}" text-anchor="middle" class="lbl">${fmt(ex.baseline)}</text>
    <text x="${cx(0)}" y="${fr.H - fr.padB + 16}" text-anchor="middle">Start</text>`;
  bars.forEach((r, i) => {
    const top = fr.y(Math.max(r.from, r.to)), h = Math.max(1.5, Math.abs(fr.y(r.from) - fr.y(r.to)));
    const c = r.push >= 0 ? "var(--up)" : "var(--down)";
    inner += `<line x1="${cx(i) - bw / 2 - 6}" x2="${cx(i + 1) + bw / 2}" y1="${fr.y(r.from)}" y2="${fr.y(r.from)}" stroke="var(--faint)" stroke-dasharray="3 3"/>
      <rect x="${cx(i + 1) - bw / 2}" y="${top}" width="${bw}" height="${h}" fill="${c}" rx="2"/>
      <text x="${cx(i + 1)}" y="${top - 6}" text-anchor="middle" class="lbl" style="fill:${c}">${signed(r.push)}</text>
      ${tick(cx(i + 1), r.label)}`;
  });
  const last = n - 1;
  inner += `<line x1="${cx(last - 1) + bw / 2}" x2="${cx(last) - bw / 2}" y1="${fr.y(ex.prediction)}" y2="${fr.y(ex.prediction)}" stroke="var(--faint)" stroke-dasharray="3 3"/>
    <line x1="${cx(last) - bw / 2}" x2="${cx(last) + bw / 2}" y1="${fr.y(ex.prediction)}" y2="${fr.y(ex.prediction)}" stroke="var(--accent)" stroke-width="4"/>
    <text x="${cx(last)}" y="${fr.y(ex.prediction) - 8}" text-anchor="middle" class="lbl" style="fill:var(--accent);font-weight:700">${fmt(ex.prediction)}</text>
    <text x="${cx(last)}" y="${fr.H - fr.padB + 16}" text-anchor="middle">Prediction</text>`;
  if (showObs) inner += `<line x1="${fr.padL}" x2="${fr.W - fr.padR}" y1="${fr.y(person.observed)}" y2="${fr.y(person.observed)}" stroke="var(--obs)" stroke-dasharray="6 4"/>
    <text x="${fr.W - fr.padR}" y="${fr.y(person.observed) - 5}" text-anchor="end" style="fill:var(--obs)">measured ${fmt(person.observed)}</text>`;
  inner += `<text x="${fr.padL}" y="${fr.H - 22}" >Orange bars push the prediction up, blue bars pull it down. Bar height = size of the push in ${u}.</text>`;

  const eqTerms = rows.map((r) => `<span class="${clsOf(r.push)}">${signed(r.push)}</span>`).join(" ");
  const tableRows = rows.map((r) => {
    if (r.group) {
      return `<tr><td>${r.label}</td><td>${r.value}</td><td class="muted">training mix</td>
        <td class="num">${r.levelCol ? `${signed(r.coef)} <span class="muted">vs ${r.group.reference}</span>` : `0 <span class="muted">(${r.group.reference} is the reference group)</span>`}</td>
        <td class="num ${clsOf(r.push)}"><b>${signed(r.push)}</b></td></tr>`;
    }
    const d = r.value - r.ref;
    return `<tr><td>${r.label}</td><td class="num">${fmt(r.value, 2)} ${r.units}</td><td class="num">${fmt(r.ref, 2)}</td>
      <td class="num">${signed(r.coef, 3)} per ${r.units}</td>
      <td class="num ${clsOf(r.push)}"><b>${signed(r.push)}</b> <span class="muted">= ${signed(r.coef, 3)} × ${signed(d, 2)}</span></td></tr>`;
  }).join("");

  // Coefficient vs push: pick the numeric feature with the largest coefficient magnitude relative to its push
  const numeric = rows.filter((r) => !r.group);
  const demo = numeric.slice().sort((a, c) => Math.abs(c.coef * b.feature_stats[c.name].train_sd) - Math.abs(a.coef * b.feature_stats[a.name].train_sd))[0];
  const dDemo = demo.value - demo.ref;

  $("lin-s1").innerHTML = `
    ${step(1, "Start from the training average", `
      <p>A linear model doesn't start at zero. It starts at the <b>starting point</b>: the prediction for a made-up person whose every
        feature equals the training average (average age, average BMI, the average mix of sexes, and so on).</p>
      <p class="big">Starting point = <b>${fmt(ex.baseline)} ${u}</b></p>
      <p class="note">This is not the model's intercept (${fmt(lin.intercept)} ${u}), which is the prediction when every feature is 0, such as age 0 and BMI 0. No real person looks like that.</p>`)}
`;
  $("lin-s2-title").textContent = `Add one push per feature for ${who}`;
  $("lin-chart").innerHTML = `
      ${fr.wrap(inner, "Waterfall chart from starting point through each push to the prediction")}
      <div class="eq">${fmt(ex.baseline)} ${eqTerms} = <b style="color:var(--accent)">${fmt(ex.prediction)} ${u}</b></div>
      <p>${biggestUp ? `Biggest upward push: <b class="up">${biggestUp.label} (${signed(biggestUp.push)})</b>. ` : ""}${biggestDown ? `Biggest downward push: <b class="down">${biggestDown.label} (${signed(biggestDown.push)})</b>.` : ""}</p>`;
  $("lin-rest").innerHTML = `
    ${step(3, "Rebuild every push yourself", `
      <div class="tablewrap"><table>
        <tr><th>Feature</th><th>This person</th><th class="num">Training average</th><th class="num">Coefficient</th><th class="num">Push (${u})</th></tr>
        <tr><td colspan="4"><b>Starting point</b></td><td class="num"><b>${fmt(ex.baseline)}</b></td></tr>
        ${tableRows}
        <tr><th colspan="4">Prediction = starting point + all pushes</th><th class="num" style="color:var(--accent)">${fmt(ex.prediction)} ${u}</th></tr>
        ${showObs ? `<tr><td colspan="4" class="obs">Measured value</td><td class="num obs">${fmt(person.observed)} ${u}</td></tr>` : ""}
      </table></div>
      <p class="note"><b>Categories:</b> ${b.categorical_groups.map((g) => g.label.toLowerCase()).join(" and ")} get one push each, measured from the
        training <i>mix</i>. That's why even someone in the reference group (${b.categorical_groups.map((g) => g.reference).join(", ")}) can get a small push.
        The coefficient shown for a category compares this person's group with the reference group, holding the other features fixed.</p>`)}
    ${step(4, "A coefficient is not a push", `
      <div class="callout">
        <p><b>${demo.label.split(" (")[0]}</b> has a coefficient of <b>${signed(demo.coef, 3)} ${u} per ${demo.units}</b>. That number is the same for everyone in the data.</p>
        <p>${who} is <b>${signed(dDemo, 2)} ${demo.units}</b> from the training average, so their push is
          ${signed(demo.coef, 3)} × ${signed(dDemo, 2)} = <b class="${clsOf(demo.push)}">${signed(demo.push)} ${u}</b>.</p>
        <p>Someone exactly at the average ${demo.label.split(" (")[0]} would get a push of <b>0</b> from the same coefficient. A big coefficient can give a tiny push,
          and a small coefficient can give a big push if the person is far from average.</p>
      </div>
      ${farOff ? `<div class="callout warn"><p><b>Where one straight line fails.</b> The line predicts ${fmt(ex.prediction)} ${u}, but this person measured ${fmt(person.observed)} ${u}
        (off by ${signed(err)} ${u}). A linear model gives each feature one fixed slope for everyone. ${state.key === "fev1"
          ? "Lung function rises through childhood and then falls with age, and a single straight line in age can't bend to follow both. That isn't a bug; it's the limit of the model."
          : "When the real relationship bends or depends on combinations of features, one straight line can't follow it."}</p></div>` : ""}`)}`;
}

function drawLinearGeneral(b) {
  const t = b.linear.typical_effect_per_sd, u = b.units;
  const items = Object.entries(t).map(([f, v]) => ({ f, v, sd: b.feature_stats[f].train_sd })).sort((a, c) => Math.abs(c.v) - Math.abs(a.v));
  const mx = Math.max(...items.map((i) => Math.abs(i.v)));
  const W = 680, rowH = 30, H = items.length * rowH + 30, mid = 360, half = 220;
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Typical effect per standard deviation">
    <line x1="${mid}" x2="${mid}" y1="0" y2="${H - 20}" stroke="var(--muted)"/>
    ${items.map((it, i) => {
      const w = (Math.abs(it.v) / mx) * half, yy = i * rowH + 6;
      const x0 = it.v >= 0 ? mid : mid - w;
      return `<text x="${mid - half - 10}" y="${yy + 15}" text-anchor="end" class="lbl">${featureLabel(b, it.f).split(" (")[0]}</text>
        <rect x="${x0}" y="${yy}" width="${w}" height="20" fill="${it.v >= 0 ? "var(--up)" : "var(--down)"}" rx="2"/>
        <text x="${it.v >= 0 ? mid + w + 6 : mid - w - 6}" y="${yy + 15}" text-anchor="${it.v >= 0 ? "start" : "end"}">${signed(it.v)}</text>`;
    }).join("")}
    <text x="${mid}" y="${H - 4}" text-anchor="middle">change in prediction (${u}) for a 1-SD higher value</text>
  </svg>`;
  $("lin-general").innerHTML = step(5, "Overall importance is a different question", `
    <p>Raw coefficients can't be compared across features, because they're in different units (per year, per cm, per kg/m²).
      A fair "in general" comparison is the <b>typical effect</b>: coefficient × one standard deviation (SD) of that feature in the training data.
      This describes the whole model, not one person.</p>
    ${svg}
    <p class="note">Category features (${b.categorical_groups.map((g) => g.label.toLowerCase()).join(", ")}) aren't on this chart because they have no SD in the same sense.
      These are associations in the data, not causes: they don't say what would happen if someone changed a value.</p>`);
}

// =====================================================================================
// 2. WISDOM OF THE FOREST (random forest)
// =====================================================================================
function renderForest(b, person) {
  const u = b.units, rf = b.forest, pf = rf.people[person.id];
  const trees = pf.tree_predictions, N = rf.n_trees;
  const pct = (a) => Math.round((100 * a) / rf.n_training_rows);
  const uniq = rf.bootstrap_unique_training_rows;
  const avgU = uniq.reduce((a, c) => a + c, 0) / uniq.length;
  const rootCounts = {};
  rf.root_split.forEach((r) => (rootCounts[r.feature] = (rootCounts[r.feature] || 0) + 1));
  const lo = Math.min(...trees), hi = Math.max(...trees);
  const sorted = trees.slice().sort((a, c) => a - c);
  const q = (p) => sorted[Math.round(p * (sorted.length - 1))];
  const inside = person.observed >= lo && person.observed <= hi;
  const err = pf.prediction - person.observed;

  $("section").innerHTML = `
    <h2>Wisdom of the Forest</h2>
    <p class="question">How do many different trees combine into one prediction?</p>
    <div class="goal"><b>What you'll be able to do:</b> explain how a random forest builds many <i>different</i> trees and combines them by
      <b>averaging</b>, and tell <b>disagreement between trees</b> apart from real <b>uncertainty</b> about the prediction.</div>

    ${step(1, "One tree is a chain of yes/no questions", `
      <p>A decision tree asks a question about one feature, follows the answer, asks another, and ends at a <b>leaf</b>.
        The leaf's guess is the average outcome of the training people who ended up there. Here's the path ${person.label} takes through five of the trees:</p>
      <div class="btnrow" id="tree-tabs">${pf.traced_trees.map((_, i) => `<button class="btn ${i === state.tree ? "on" : ""}" data-t="${i}">Tree ${i + 1}</button>`).join("")}</div>
      <div id="tree-path"></div>`)}

    ${step(2, "Why the trees are different from each other", `
      <p>If every tree saw the same data and asked the same questions, they'd all give the same answer, and averaging would be pointless.
        Two deliberate sources of randomness make them differ:</p>
      <div class="tablewrap"><table>
        <tr><th>Randomness</th><th>What it does here</th></tr>
        <tr><td><b>Bootstrap sample</b> (rows drawn at random, with repeats)</td><td>Each tree learns from a different resample of the ${fmt(rf.n_training_rows, 0)} training people.
          On average a tree sees only <b>${pct(avgU)}%</b> of them (range ${pct(Math.min(...uniq))}–${pct(Math.max(...uniq))}%); the rest are duplicates.</td></tr>
        <tr><td><b>Random features at each split</b></td><td>At every question, a tree may only choose from <b>${rf.features_tried_per_split} of the ${rf.n_features}</b> features, picked at random.</td></tr>
      </table></div>
      <p>The result shows in the very first question each tree asks:</p>
      ${rootChart(b, rootCounts, N)}`)}

    ${step(3, "Combine them by averaging", `
      <p>Each dot is one tree's guess for ${person.label}. The forest's prediction is simply the <b>average of all ${N} guesses</b>.
        Drag the slider to average more trees.</p>
      <div class="slider"><label for="ntrees">Trees averaged:</label><input id="ntrees" type="range" min="1" max="${N}" value="${state.nTrees}"><b id="ntrees-v"></b></div>
      <div id="forest-strip"></div>
      <div id="forest-running"></div>`)}

    ${step(4, "Disagreement is not uncertainty", `
      <p>For ${person.label}, the trees' guesses run from <b>${fmt(lo)}</b> to <b>${fmt(hi)} ${u}</b> (middle 90%: ${fmt(q(0.05))} to ${fmt(q(0.95))}).
        That spread is <b>disagreement between trees</b>. It is <b>not</b> a confidence interval or a range where the true value is likely to be.</p>
      <div class="callout warn">
        <p>The measured value was <b class="obs">${fmt(person.observed)} ${u}</b>, which falls <b>${inside ? "inside" : "outside"}</b> the trees' range here.
          The forest missed by <b>${signed(err)} ${u}</b>.</p>
        <p>Why spread ≠ uncertainty: every tree learned from the same training people, so they can all share the same blind spot, agreeing closely and still being wrong.
          The spread only tells you how much the resampling changed the answer. A forest also can't predict outside the training outcomes
          (${fmt(rf.training_target_range[0])} to ${fmt(rf.training_target_range[1])} ${u}), because every leaf is an average of real training people.</p>
        <p>To judge how wrong predictions usually are, look at errors on people the model didn't train on: the forest's typical error (validation RMSE) is
          <b>${fmt(rf.rmse.validation)} ${u}</b>.</p>
      </div>
      <p class="note">Compare Example person 4 ("trees disagree most") with Example person 5 ("trees agree most") in the Person menu.
        Agreement among trees doesn't mean the prediction is right.</p>`)}

    ${step(5, "More trees: steadier, not smarter", `
      <p>Averaging more trees mostly smooths out the randomness. The validation error drops quickly for the first trees, then levels off.
        Adding trees doesn't fix what all the trees get wrong.</p>
      ${valByTreesChart(b)}`)}`;

  const drawTree = () => {
    const t = pf.traced_trees[state.tree];
    $("tree-path").innerHTML = `<div class="path">${t.steps.map((s) =>
      `<span class="chip">${featureLabel(b, s.feature).split(" (")[0]} ${s.goes} ${fmt(s.threshold, 2)}</span><span class="muted">→</span>`).join("")}
      <span class="chip leaf">leaf: ${fmt(t.leaf_value)} ${u}</span></div>
      <p class="note">${t.steps.length} questions. Tree ${state.tree + 1}'s guess is <b>${fmt(trees[state.tree])} ${u}</b>. Other trees ask different questions and land in different leaves.</p>`;
    document.querySelectorAll("#tree-tabs [data-t]").forEach((el) => el.classList.toggle("on", Number(el.dataset.t) === state.tree));
  };
  document.querySelectorAll("#tree-tabs [data-t]").forEach((el) => (el.onclick = () => { state.tree = Number(el.dataset.t); drawTree(); }));
  drawTree();

  const update = (k) => {
    $("ntrees-v").textContent = `${k} of ${N}`;
    const avgK = k === N ? pf.prediction : m10.runningAverage(trees, k); // all trees → use the bundle's forest prediction
    // strip plot
    const vals = trees.concat([person.observed, pf.prediction]);
    const [xMin, xMax] = pad(Math.min(...vals), Math.max(...vals), 0.06);
    const fr = frame({ W: 720, H: 210, padB: 44, padT: 26, xMin, xMax, yMin: 0, yMax: 1, yTicks: [], xLabel: `${SHORT[state.key]} (${u})`, padL: 20, xGrid: true });
    const jit = (i) => 0.15 + 0.7 * (((i * 37) % 100) / 100);
    let inner = trees.map((t, i) => `<circle cx="${fr.x(t)}" cy="${fr.y(jit(i))}" r="${i < k ? 5 : 3.5}" fill="${i < k ? "var(--accent)" : "var(--faint)"}" opacity="${i < k ? 0.8 : 0.7}"/>`).join("");
    const mark = (v, c, lab, yy, dash) => `<line x1="${fr.x(v)}" x2="${fr.x(v)}" y1="${fr.padT - 4}" y2="${fr.H - fr.padB}" stroke="${c}" stroke-width="2.5" ${dash ? 'stroke-dasharray="6 4"' : ""}/>
      <text x="${fr.x(v)}" y="${yy}" text-anchor="middle" style="fill:${c};font-weight:600">${lab}</text>`;
    inner += mark(person.observed, "var(--obs)", `measured ${fmt(person.observed)}`, 12, true);
    if (k < N) inner += mark(avgK, "var(--accent)", `partial forest ${fmt(avgK)}`, fr.H - 4 - 30, false);
    inner += mark(pf.prediction, "var(--fg)", `forest (all ${N}) ${fmt(pf.prediction)}`, 24, false);
    const shown = trees.slice(0, Math.min(k, 6)).map((t) => fmt(t)).join(" + ");
    $("forest-strip").innerHTML = fr.wrap(inner, "Tree guesses strip plot") + `
      <div class="eq">${k < N ? "<b>Partial forest</b>" : "<b>Whole forest</b>"}: (${shown}${k > 6 ? " + …" : ""}) ÷ ${k} = <b style="color:var(--accent)">${fmt(avgK)} ${u}</b>
        ${k < N ? `&nbsp;<span class="muted">→ with all ${N} trees: <b>${fmt(pf.prediction)} ${u}</b></span>` : ""}</div>
      ${legend([["var(--accent)", "trees included in the average"], ["var(--faint)", "trees not yet included"], ["var(--fg)", "forest prediction (all trees)"], ["var(--obs)", "measured value", true]])}`;
    // running average
    const pts = trees.map((_, i) => [i + 1, m10.runningAverage(trees, i + 1)]);
    const ys = pts.map((p) => p[1]).concat([pf.prediction]);
    const [a, c] = pad(Math.min(...ys), Math.max(...ys), 0.1);
    const fr2 = frame({ W: 720, H: 220, xMin: 1, xMax: N, yMin: a, yMax: c, xLabel: "Number of trees averaged", yLabel: `Average (${u})` });
    $("forest-running").innerHTML = `<p>As you add trees, the average wobbles at first and then settles down:</p>` + fr2.wrap(`
      <line x1="${fr2.padL}" x2="${fr2.W - fr2.padR}" y1="${fr2.y(pf.prediction)}" y2="${fr2.y(pf.prediction)}" stroke="var(--fg)" stroke-dasharray="4 3"/>
      <path d="${pathOf(pts, fr2.x, fr2.y)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
      <circle cx="${fr2.x(k)}" cy="${fr2.y(avgK)}" r="5" fill="var(--accent)"/>`, "Running average of tree guesses");
  };
  $("ntrees").oninput = (e) => { state.nTrees = Number(e.target.value); update(state.nTrees); };
  update(state.nTrees);
}

function rootChart(b, counts, N) {
  const items = Object.entries(counts).sort((a, c) => c[1] - a[1]);
  const W = 680, rowH = 28, H = items.length * rowH + 8, x0 = 230, maxW = 380;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="First question asked by each tree">
    ${items.map(([f, c], i) => `<text x="${x0 - 8}" y="${i * rowH + 18}" text-anchor="end" class="lbl">${featureLabel(b, f).split(" (")[0]}</text>
      <rect x="${x0}" y="${i * rowH + 4}" width="${(c / N) * maxW}" height="20" fill="var(--accent)" rx="2"/>
      <text x="${x0 + (c / N) * maxW + 6}" y="${i * rowH + 18}">${c} of ${N} trees</text>`).join("")}
  </svg><p class="note">First question asked by each of the ${N} trees. Different trees start with different features.</p>`;
}

function valByTreesChart(b) {
  const v = b.forest.validation_rmse_by_trees, u = b.units;
  const pts = v.map((r, i) => [i + 1, r]);
  const [lo, hi] = pad(Math.min(...v), Math.max(...v), 0.1);
  const fr = frame({ W: 720, H: 230, xMin: 1, xMax: v.length, yMin: lo, yMax: hi, xLabel: "Number of trees in the forest", yLabel: `Validation RMSE (${u})`, yFmt: (x) => fmt(x, hi - lo < 10 ? 1 : 0) });
  return fr.wrap(`<path d="${pathOf(pts, fr.x, fr.y)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`, "Validation RMSE by number of trees") +
    `<p class="note">RMSE (root mean squared error) is the typical size of a miss on validation people, in ${u}. 1 tree: ${fmt(v[0])}; 10 trees: ${fmt(v[9])}; ${v.length} trees: ${fmt(v[v.length - 1])}.</p>`;
}

// =====================================================================================
// 3. ONE CORRECTION AT A TIME (gradient boosting)
// =====================================================================================
function renderBoosting(b, person) {
  const u = b.units, gb = b.boosting, p = gb.people[person.id];
  const R = p.corrections.length;
  const best = gb.best_validation_round;
  const vEnd = gb.rmse.validation[R], tEnd = gb.rmse.train[R];
  $("section").innerHTML = `
    <h2>One Correction at a Time</h2>
    <p class="question">How does each new tree improve the model, and when should training stop?</p>
    <div class="goal"><b>What you'll be able to do:</b> explain how gradient boosting builds its prediction by adding <b>one small correction per round</b>,
      and use <b>validation error</b> to decide when to stop adding them.</div>

    ${step(1, "Round 0: guess the average", `
      <p>Boosting starts with the simplest possible guess for everyone: the average outcome in the training data.</p>
      <p class="big">Round 0 = <b>${fmt(gb.init)} ${u}</b> for every person</p>`)}

    ${step(2, "Each round adds one small correction", `
      <p>In every round a new small tree (depth ${gb.settings.max_depth}) is fitted to the <b>training residuals</b>, the errors still left over
        (measured minus current prediction). Its answer is shrunk by the <b>learning rate</b> (${gb.learning_rate}) and added on.
        The corrections below already include that shrinking.</p>
      <div class="slider"><label for="round">Round:</label><input id="round" type="range" min="0" max="${R}" value="${state.round}"><b id="round-v"></b></div>
      <div class="btnrow">
        ${[0, 1, 2, 5, 10, 50].map((r) => `<button class="btn" data-r="${r}">${r}</button>`).join("")}
        <button class="btn" data-r="${best}">best validation round (${best})</button>
        <button class="btn" data-r="${R}">${R}</button>
      </div>
      <div id="b-eq"></div>
      <div id="b-mini"></div>
      <div id="b-path"></div>
      <div id="b-corr"></div>`)}

    ${step(3, "What the next tree aims at: the leftover errors", `
      <p>Each dot is one of 200 training people, placed by their residual (measured − prediction) at a given round. Each new tree tries to predict these leftovers,
        so the cloud tightens around 0 round by round.</p>
      <div id="b-resid"></div>`)}

    ${step(4, "When to stop: watch the validation error", `
      <p>Training error keeps falling as long as you add trees, because each tree is fitted to the training data. That doesn't mean predictions for new people keep improving.
        So we track error on <b>validation</b> people the trees were never fitted to, and stop where it's lowest.</p>
      <div class="btnrow"><label><input type="checkbox" id="slow" ${state.showSlow ? "checked" : ""}> also show a slower learning rate (0.02)</label></div>
      <div id="b-rmse"></div>
      <div class="callout">
        <p>Lowest validation RMSE: <b>${fmt(gb.best_validation_rmse)} ${u} at round ${best}</b>.
          By round ${R}, training RMSE has fallen to ${fmt(tEnd)} ${u} but validation RMSE is ${fmt(vEnd)} ${u}${vEnd > gb.best_validation_rmse ? ", worse than at the best round. The later trees are fitting quirks of the training people (overfitting)." : "."}</p>
        <p class="note">Because round ${best} was chosen by looking at validation data, its error is a little optimistic. It's a validation-based choice, not an independent test result.</p>
      </div>`)}`;

  const slow = gb.comparison_learning_rate_0_02;
  const update = (k) => {
    $("round-v").textContent = `${k} of ${R}`;
    $("round").value = k;
    // equation
    $("b-eq").innerHTML = k === 0
      ? `<div class="eq">Round 0 = training average = <b style="color:var(--accent)">${fmt(gb.init)} ${u}</b></div>`
      : `<div class="eq">After round ${k - 1}: ${fmt(p.staged[k - 1])} &nbsp; + &nbsp; tree ${k}'s correction <b class="${clsOf(p.corrections[k - 1])}">${signed(p.corrections[k - 1], 2)}</b>
          &nbsp; = &nbsp; <b style="color:var(--accent)">${fmt(p.staged[k])} ${u}</b> after round ${k}
          <span class="muted">&nbsp;(measured: ${fmt(person.observed)})</span></div>`;
    // prediction path
    const pts = p.staged.map((v, i) => [i, v]);
    const ys = p.staged.concat([person.observed]);
    const [lo, hi] = pad(Math.min(...ys), Math.max(...ys), 0.1);
    const fr = frame({ W: 720, H: 240, xMin: 0, xMax: R, yMin: lo, yMax: hi, xLabel: "Round (number of trees added)", yLabel: `Prediction (${u})` });
    $("b-path").innerHTML = `<p>${person.label}'s prediction, round by round:</p>` + fr.wrap(`
      <line x1="${fr.padL}" x2="${fr.W - fr.padR}" y1="${fr.y(person.observed)}" y2="${fr.y(person.observed)}" stroke="var(--obs)" stroke-dasharray="6 4"/>
      <text x="${fr.W - fr.padR}" y="${fr.y(person.observed) - 5}" text-anchor="end" style="fill:var(--obs)">measured ${fmt(person.observed)}</text>
      <path d="${pathOf(pts, fr.x, fr.y)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
      <line x1="${fr.x(best)}" x2="${fr.x(best)}" y1="${fr.padT}" y2="${fr.H - fr.padB}" stroke="var(--muted)" stroke-dasharray="2 3"/>
      <circle cx="${fr.x(k)}" cy="${fr.y(p.staged[k])}" r="6" fill="var(--accent)" stroke="var(--bg)" stroke-width="2"/>`, "Prediction by round") +
      legend([["var(--accent)", "prediction after each round"], ["var(--obs)", "measured value", true], ["var(--muted)", `best validation round (${best})`, true]]);
    // corrections bars (first 60 rounds)
    const M = Math.min(60, R), cs = p.corrections.slice(0, M);
    const mx = Math.max(...cs.map(Math.abs)) || 1;
    const fr2 = frame({ W: 720, H: 200, xMin: 0.5, xMax: M + 0.5, yMin: -mx * 1.1, yMax: mx * 1.1, xLabel: `Round (first ${M})`, yLabel: `Correction (${u})`, yFmt: (v) => fmt(v, mx < 5 ? 1 : 0), xTicks: [1, 10, 20, 30, 40, 50, 60].filter((t) => t <= M) });
    const bw = (fr2.W - fr2.padL - fr2.padR) / M * 0.75;
    $("b-corr").innerHTML = `<p>Each bar is one tree's correction for ${person.label}. Early trees fix big errors; later ones make tiny adjustments.</p>` + fr2.wrap(
      `<line x1="${fr2.padL}" x2="${fr2.W - fr2.padR}" y1="${fr2.y(0)}" y2="${fr2.y(0)}" stroke="var(--muted)"/>` +
      cs.map((c, i) => `<rect x="${fr2.x(i + 1) - bw / 2}" y="${fr2.y(Math.max(0, c))}" width="${bw}" height="${Math.max(1, Math.abs(fr2.y(c) - fr2.y(0)))}"
        fill="${c >= 0 ? "var(--up)" : "var(--down)"}" opacity="${i + 1 === k ? 1 : 0.55}" ${i + 1 === k ? 'stroke="var(--fg)" stroke-width="1.5"' : ""}/>`).join(""), "Corrections per round");
    drawResid(b, k);
    drawRmse(b, k, slow);
    drawMini(b, k);
  };
  $("round").oninput = (e) => { state.round = Number(e.target.value); update(state.round); };
  document.querySelectorAll("[data-r]").forEach((el) => (el.onclick = () => { state.round = Number(el.dataset.r); update(state.round); }));
  $("slow").onchange = (e) => { state.showSlow = e.target.checked; drawRmse(b, state.round, slow); };
  update(state.round);
}

function drawResid(b, k) {
  const rs = b.boosting.residual_snapshots, u = b.units;
  const snap = rs.rounds.filter((r) => r <= k).pop();
  const allRes = rs.rounds.map((r) => rs.observed.map((o, i) => o - rs.predictions[String(r)][i])).flat();
  const res = rs.observed.map((o, i) => o - rs.predictions[String(snap)][i]);
  const rms = Math.sqrt(res.reduce((a, c) => a + c * c, 0) / res.length);
  const lim = Math.max(...allRes.map(Math.abs));
  const fr = frame({ W: 720, H: 150, padT: 10, padB: 42, xMin: -lim, xMax: lim, yMin: 0, yMax: 1, yTicks: [], xLabel: `Residual = measured − prediction (${u})`, padL: 20, xGrid: true });
  const jit = (i) => 0.12 + 0.76 * (((i * 53) % 100) / 100);
  $("b-resid").innerHTML = `<div class="btnrow">${rs.rounds.map((r) => `<span class="chip" style="${r === snap ? "background:var(--fg);color:var(--bg)" : ""}">${r}</span>`).join("")}</div>` +
    fr.wrap(`<line x1="${fr.x(0)}" x2="${fr.x(0)}" y1="${fr.padT}" y2="${fr.H - fr.padB}" stroke="var(--fg)"/>` +
      res.map((r, i) => `<circle cx="${fr.x(r)}" cy="${fr.y(jit(i))}" r="3.5" fill="${r >= 0 ? "var(--up)" : "var(--down)"}" opacity="0.7"/>`).join(""), "Training residuals") +
    `<p class="note">Showing the saved snapshot at round <b>${snap}</b> (closest saved round at or below your slider). Typical leftover error in these 200 training people:
      <b>${fmt(rms)} ${u}</b>. Orange = model still too low, blue = too high.</p>`;
}

// Compact error chart that sits right under the round slider, so the effect of each round is visible without scrolling
function drawMini(b, k) {
  const gb = b.boosting, u = b.units, tr = gb.rmse.train, va = gb.rmse.validation, R = tr.length - 1;
  const [a, c] = pad(Math.min(...tr, ...va), Math.max(tr[0], va[0]), 0.05);
  const fr = frame({ W: 720, H: 170, padT: 10, padB: 40, xMin: 0, xMax: R, yMin: a, yMax: c, xLabel: "Round", yLabel: `RMSE (${u})`, yFmt: (v) => fmt(v, c - a < 10 ? 1 : 0), yTicks: niceTicks(a, c, 3) });
  const L = (arr) => pathOf(arr.map((v, i) => [i, v]), fr.x, fr.y);
  const where = k < gb.best_validation_round ? "still improving on new people" : k === gb.best_validation_round ? "lowest validation error: the stopping point" : "past the best round: overfitting the training people";
  $("b-mini").innerHTML = `<p style="margin-bottom:0">Error at round <b>${k}</b>: training ${fmt(tr[k])} ${u}, validation <b>${fmt(va[k])} ${u}</b> (${where}).</p>` +
    fr.wrap(`<path d="${L(tr)}" fill="none" stroke="var(--muted)" stroke-width="2"/><path d="${L(va)}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      <circle cx="${fr.x(gb.best_validation_round)}" cy="${fr.y(gb.best_validation_rmse)}" r="5" fill="var(--accent)"/>
      <line x1="${fr.x(k)}" x2="${fr.x(k)}" y1="${fr.padT}" y2="${fr.H - fr.padB}" stroke="var(--fg)" stroke-dasharray="4 3"/>
      <circle cx="${fr.x(k)}" cy="${fr.y(va[k])}" r="4" fill="var(--fg)"/>`, "Training and validation RMSE, compact") +
    legend([["var(--muted)", "training RMSE"], ["var(--accent)", "validation RMSE (dot = lowest)"], ["var(--fg)", "this round", true]]);
}

function drawRmse(b, k, slow) {
  const gb = b.boosting, u = b.units;
  const tr = gb.rmse.train, va = gb.rmse.validation, R = tr.length - 1;
  const all = tr.concat(va).concat(state.showSlow ? slow.rmse.validation : []);
  // Zoom the y-axis below round 0's error so the interesting part is visible
  const hi = Math.max(va[0], tr[0]), lo = Math.min(...all);
  const [a, c] = pad(lo, hi, 0.05);
  const fr = frame({ W: 720, H: 270, xMin: 0, xMax: R, yMin: a, yMax: c, xLabel: "Round (number of trees added)", yLabel: `RMSE (${u})`, yFmt: (v) => fmt(v, c - a < 10 ? 1 : 0) });
  const L = (arr) => pathOf(arr.map((v, i) => [i, v]), fr.x, fr.y);
  let inner = `<path d="${L(tr)}" fill="none" stroke="var(--muted)" stroke-width="2.5"/>
    <path d="${L(va)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  if (state.showSlow) inner += `<path d="${L(slow.rmse.validation)}" fill="none" stroke="var(--up)" stroke-width="2" stroke-dasharray="5 4"/>
    <circle cx="${fr.x(slow.best_validation_round)}" cy="${fr.y(slow.best_validation_rmse)}" r="5" fill="var(--up)"/>`;
  inner += `<line x1="${fr.x(k)}" x2="${fr.x(k)}" y1="${fr.padT}" y2="${fr.H - fr.padB}" stroke="var(--fg)" stroke-dasharray="4 3"/>
    <circle cx="${fr.x(gb.best_validation_round)}" cy="${fr.y(gb.best_validation_rmse)}" r="6" fill="var(--accent)" stroke="var(--bg)" stroke-width="2"/>
    <text x="${fr.x(gb.best_validation_round) + 8}" y="${fr.y(gb.best_validation_rmse) - 10}" class="lbl">best: round ${gb.best_validation_round}</text>`;
  $("b-rmse").innerHTML = fr.wrap(inner, "Training and validation RMSE by round") +
    legend([["var(--muted)", "training RMSE"], ["var(--accent)", "validation RMSE (learning rate 0.1)"], ...(state.showSlow ? [["var(--up)", "validation RMSE, learning rate 0.02 (a separately fitted model)", true]] : []), ["var(--fg)", "your slider round", true]]) +
    `<p>At round <b>${k}</b>: training RMSE ${fmt(tr[k])} ${u}, validation RMSE <b>${fmt(va[k])} ${u}</b>.
      ${k < gb.best_validation_round ? "Still improving on new people: keep adding trees." : k === gb.best_validation_round ? "This is the lowest validation error: stop here." : "Past the best round: extra trees now help the training people more than new people."}</p>` +
    (state.showSlow ? `<p class="note">With smaller steps (learning rate 0.02), each correction is smaller, so it needs more rounds:
      its best validation round is <b>${slow.best_validation_round}</b> (RMSE ${fmt(slow.best_validation_rmse)} ${u}) vs round ${gb.best_validation_round} at 0.1.</p>` : "");
}

setup();
