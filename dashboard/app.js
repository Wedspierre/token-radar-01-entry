/* Token Radar v2.6 dashboard — renders window.TOKEN_RADAR (data.js) only. No network. */
const D = window.TOKEN_RADAR;
const $ = (s) => document.querySelector(s);
const money = (n) => {
  if (n == null) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
};
const pct = (n) => (n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%');
const ageStr = (d) => d == null ? 'unknown' : d < 365 ? Math.round(d / 30.4) + ' mo' : (d / 365).toFixed(1) + ' yr';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const vclass = (v) => v === 'WORTH IT' ? 'v-worth' : v === 'MARGINAL' ? 'v-marg' : 'v-skip';

/* integrity strip on the cover: every check answered, with its number */
$('#strip').innerHTML = D.integrity.map((c) =>
  `<span class="pill"><b>${c.pass ? '✓' : '✗'}</b> ${esc(c.check)} — ${esc(c.result)}</span>`).join('');

/* category filter options */
const cats = [...new Set(D.board.map((r) => r.category))].sort();
$('#cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');

let sortKey = 'ev';
function sortedRows() {
  let rows = D.board.slice();
  const q = ($('#q').value || '').trim().toLowerCase();
  const cat = $('#cat').value;
  if ($('#wl').checked) rows = rows.filter((r) => r.watchlist);
  if (cat) rows = rows.filter((r) => r.category === cat);
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q));
  const key = { ev: (r) => -r.implied_value_usd, implied: (r) => -r.implied_if_launches_usd, odds: (r) => -r.launch_odds, tvl: (r) => -r.tvl_usd, age: (r) => -(r.age_days ?? 1e9) }[sortKey];
  rows.sort((a, b) => key(a) - key(b));
  return rows;
}
function renderBoard() {
  const rows = sortedRows();
  $('#count').textContent = rows.length + ' of ' + D.board.length + ' rows';
  $('#board tbody').innerHTML = rows.map((r) => `<tr data-slug="${esc(r.slug)}">
    <td class="rk">${r.rank}</td>
    <td><b>${esc(r.name)}</b>${r.watchlist ? '<span class="tag">WATCHLIST</span>' : ''}${r.flagged ? '<span class="flag"> ▲ $50M+ · off-list</span>' : ''}<span class="sub">${esc(r.slug)}</span></td>
    <td>${esc(r.category)}</td>
    <td class="num">${money(r.tvl_usd)}</td>
    <td class="num">${pct(r.change_7d)}</td>
    <td>${ageStr(r.age_days)}</td>
    <td class="num">${money(r.implied_if_launches_usd)}</td>
    <td class="num">${(r.launch_odds * 100).toFixed(0)}%</td>
    <td class="num ev">${money(r.implied_value_usd)}<span class="sub">${money(r.value_low_usd)} – ${money(r.value_high_usd)}</span></td>
    <td><span class="${vclass(r.verdict_50)}">${r.verdict_50}</span> / <span class="${vclass(r.verdict_250)}">${r.verdict_250}</span> / <span class="${vclass(r.verdict_1000)}">${r.verdict_1000}</span></td>
  </tr>`).join('');
}
function renderDetail(slug) {
  const r = D.board.find((x) => x.slug === slug);
  const box = $('#detail');
  if (!r) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<p><a href="#/" class="back">← Back to the board</a></p>
  <h2>#${r.rank} ${esc(r.name)}</h2>
    <p class="meta">${esc(r.slug)} · ${esc(r.category)} · chains: ${esc(r.chains.join(', ') || '—')} · TVL ${money(r.tvl_usd)} · 7-day ${pct(r.change_7d)} · tracked ${ageStr(r.age_days)}${r.watchlist ? ' · <b>on the house watchlist</b>' : ''}</p>
    ${r.flagged ? '<p class="warn">Above the $50M floor but NOT on the house watchlist — the house rule also excludes protocols whose parent protocol\'s token already trades, and parentProtocol is not one of the snapshot\'s ten fields, so this board cannot apply that leg. Verify the parent before farming.</p>' : ''}
    <div class="kv">
      <div><b>${money(r.implied_value_usd)}</b><span>Expected launch value (rank key)</span></div>
      <div><b>${money(r.implied_if_launches_usd)}</b><span>Implied value if it launches</span></div>
      <div><b>${(r.launch_odds * 100).toFixed(0)}%</b><span>Launch odds, from the peers' record</span></div>
      <div><b>${money(r.value_low_usd)} – ${money(r.value_high_usd)}</b><span>80% conformal range</span></div>
      <div><b>$${r.gas_usd.toFixed(2)}</b><span>Gas total, ${r.hold_days}-day hold</span></div>
      <div><b>$${r.cost_per_hour_usd.toFixed(2)}/hr</b><span>Cost per active hour</span></div>
    </div>
    <h3>Farm plan — ${r.hold_days} days, ${r.active_minutes} minutes active, $${r.capital_usd} capital (withdrawable)</h3>
    <ol>${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="meta">Verdicts by plan size — $50: <span class="${vclass(r.verdict_50)}">${r.verdict_50}</span> · $250: <span class="${vclass(r.verdict_250)}">${r.verdict_250}</span> · $1,000: <span class="${vclass(r.verdict_1000)}">${r.verdict_1000}</span>. A verdict is gas as a share of capital: under 2% is worth it, under 10% marginal, over 10% skip. It never promises a payout.</p>
    <p><a href="#/" class="back">← Back to the board</a></p>`;
  window.scrollTo(0, 0);
}
$('#board tbody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-slug]');
  if (tr) { location.hash = '#/detail/' + tr.dataset.slug; }
});
['q', 'cat', 'sort', 'wl'].forEach((id) => $('#' + id).addEventListener('input', () => { if (id === 'sort') sortKey = $('#sort').value; renderBoard(); }));

/* size-curve chart: fitted curve over the traded comps (log-log SVG) */
function curveChart() {
  const W = 560, H = 260, P = 42;
  const c = D.curve;
  const xs = D.board.map((r) => Math.log10(r.tvl_usd));
  const lo = Math.floor(Math.min(...xs)), hi = Math.ceil(Math.max(...xs));
  const X = (v) => P + ((v - lo) / (hi - lo)) * (W - 2 * P);
  const Y = (v) => H - P - ((v - 3) / (10 - 3)) * (H - 2 * P);
  let pts = '';
  for (let x = lo; x <= hi; x += 0.05) pts += `${X(x).toFixed(1)},${Y(c.intercept + c.slope * x).toFixed(1)} `;
  const dots = D.board.slice(0, 60).map((r) => `<circle cx="${X(Math.log10(r.tvl_usd)).toFixed(1)}" cy="${Y(Math.log10(r.implied_if_launches_usd)).toFixed(1)}" r="2.5" fill="#f5b942" opacity="0.55"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Size curve chart">
    <polyline points="${pts}" fill="none" stroke="#57c785" stroke-width="2"/>
    ${dots}
    <text x="${P}" y="${H - 12}">TVL (log10 $) — green line: fitted curve; dots: board rows' implied values</text>
    <text x="8" y="20">log10 implied value</text></svg>`;
}

function table(head, rows) {
  return `<div class="tablewrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderMethod() {
  const v = D.validation, c = D.curve;
  $('#view-method').innerHTML = `
  <h2>Method — everything below is recomputed from the snapshot at run time</h2>
  <div class="card"><h3>The value model</h3>
    <p class="eq">log10(market cap) = ${c.intercept.toFixed(4)} + ${c.slope.toFixed(4)} × log10(TVL)</p>
    <p>Fitted on the snapshot's own <b>${c.comps} traded tokens</b> (market cap and TVL above zero). R² ${c.r2.toFixed(4)} — TVL alone explains about a fifth of traded market caps, and the board says so rather than hiding it. In-sample log-MAE ${c.in_sample_mae.toFixed(4)}. The multiple falls as TVL rises: the market pays less per dollar of TVL at size.</p>
    <p>Implied value for a pre-token protocol = curve(TVL) × category segment. Then <b>expected value = implied × launch odds</b>, and the board ranks by expected value. Launch odds come from the peers' record: the category's tokened rate (shrunk toward the global rate) times an age decay from the cumulative tokened fraction — the launch hazard falls steeply with age, so an old protocol that still records no token is discounted hard.</p></div>
  <div class="card"><h3>The curve, fitted</h3>${curveChart()}</div>
  <div class="card"><h3>Validation — every leg against the same flat-median baseline</h3>
    ${table(['Test', 'Model log-MAE', 'Flat-median log-MAE', 'Better'],
      `<tr><td>Ten-fold cross-validation (128 comps)</td><td>${v.tenFold.model.toFixed(4)}</td><td>${v.tenFold.baseline.toFixed(4)}</td><td class="pass">${v.tenFold.betterPct.toFixed(1)}%</td></tr>` +
      v.walkForward.map((w) => `<tr><td>Walk-forward, fit listings before ${w.cut} (${w.train} train / ${w.test} test, slope ${w.slope.toFixed(4)})</td><td>${w.model.toFixed(4)}</td><td>${w.baseline.toFixed(4)}</td><td class="pass">${w.betterPct.toFixed(1)}%</td></tr>`).join('') +
      `<tr><td>Blind holdout, seeded 20% by slug hash</td><td>${v.blindHoldout.model.toFixed(4)}</td><td>${v.blindHoldout.baseline.toFixed(4)}</td><td class="${v.blindHoldout.betterPct >= 0 ? 'pass' : 'fail'}">${v.blindHoldout.betterPct.toFixed(1)}%</td></tr>` +
      `<tr><td>Leave-one-out (128 curves of 127 comps)</td><td>${v.loo.model.toFixed(4)}</td><td>${v.loo.baseline.toFixed(4)}</td><td class="pass">${v.loo.betterPct.toFixed(1)}%</td></tr>`)}
    <p>Blind size curve — two seeded halves fitted alone: slopes ${v.blindSizeCurve.halfA.toFixed(4)} and ${v.blindSizeCurve.halfB.toFixed(4)}, gap ${v.blindSizeCurve.gap.toFixed(4)}. Winsorised 5/95 refit: slope ${v.winsor.slope.toFixed(4)} (delta ${v.winsor.delta >= 0 ? '+' : ''}${v.winsor.delta.toFixed(4)}). Leave-one-TVL-decile-out slopes ${v.decile.low.toFixed(4)}–${v.decile.high.toFixed(4)} (range ${v.decile.range.toFixed(4)}). Bootstrap (1,000 seeded resamples): slope 95% CI ${v.bootstrap.slopeLow.toFixed(4)}–${v.bootstrap.slopeHigh.toFixed(4)}; multiples 95% CI — $5M TVL ${v.bootstrap.mult5[0].toFixed(3)}×–${v.bootstrap.mult5[2].toFixed(3)}×, $50M ${v.bootstrap.mult50[0].toFixed(3)}×–${v.bootstrap.mult50[2].toFixed(3)}×, $500M ${v.bootstrap.mult500[0].toFixed(3)}×–${v.bootstrap.mult500[2].toFixed(3)}×.</p></div>
  <div class="card"><h3>Terms that were fitted — and dropped</h3>
    <p>A term stays only if it beats the bare curve in <b>both</b> held-out tests (ten-fold and walk-forward). Growth and age both fail, so neither is in the value model. Age still matters — through launch odds, not through value.</p>
    ${table(['Dropped term', 'Ten-fold log-MAE', 'Bare curve', 'Walk-forward 2023', 'Bare', 'Walk-forward 2025', 'Bare'],
      v.dropped.map((d) => `<tr><td>${esc(d.term)}</td><td class="fail">${d.tenFold.toFixed(4)}</td><td>${d.baseTenFold.toFixed(4)}</td><td class="fail">${d.walk2023.toFixed(4)}</td><td>${d.baseWalk2023.toFixed(4)}</td><td class="fail">${d.walk2025.toFixed(4)}</td><td>${d.baseWalk2025.toFixed(4)}</td></tr>`).join(''))}
    <p>Category segments are the one addition that earns its place: ten-fold plain ${v.segmentTenFold.plain.toFixed(4)} → segmented ${v.segmentTenFold.segmented.toFixed(4)} (${v.segmentTenFold.betterPct.toFixed(1)}% better), so a shrunk per-category adjustment is applied, capped at ±0.35 log points, only where a category has at least 5 traded comps.</p>
    ${table(['Category', 'Comps', 'Median residual', 'Adjustment', 'Multiplier'],
      D.segments.map((s) => `<tr><td>${esc(s.category)}</td><td>${s.n}</td><td>${s.medianResidual.toFixed(3)}</td><td>${s.adjustment >= 0 ? '+' : ''}${s.adjustment.toFixed(3)}</td><td>${s.multiplier.toFixed(3)}×</td></tr>`).join(''))}</div>
  <div class="card"><h3>Launch odds — from the peers' record</h3>
    <p>Among all dated protocols, the share that records a token rises with age and then stops: that is the cumulative tokened fraction. The decay is the share of still-untokened protocols at that age that ever tokenise, normalised so a newborn protocol scores 1.00. It is a cross-sectional hazard, cohort-confounded, stated as odds — never a launch forecast.</p>
    ${table(['Age band', 'Cumulative tokened share', 'Age decay'],
      D.oddsTable.map((o) => `<tr><td>${esc(o.band)}</td><td>${(o.cumTokened * 100).toFixed(1)}%</td><td>${o.decay.toFixed(3)}</td></tr>`).join(''))}
    ${table(['Category (age ≥ 1y, n ≥ 10)', 'Protocols', 'Tokened share'],
      D.categoryOdds.map((o) => `<tr><td>${esc(o.category)}</td><td>${o.n}</td><td>${(o.tokenedRate * 100).toFixed(0)}%</td></tr>`).join(''))}</div>
  <div class="card"><h3>Range honesty — conformal bands</h3>
    <p>Each row's range is its expected value times the 10th–90th percentile of ten-fold out-of-fold residuals in its TVL tercile. The board ranks by the point; the range is the honest error around it.</p>
    ${table(['TVL tercile', 'TVL range', 'p10 residual', 'p90 residual'],
      D.conformal.map((t) => `<tr><td>${t.tercile}</td><td>${money(t.loTvl)} – ${money(t.hiTvl)}</td><td>${t.p10.toFixed(3)}</td><td>${t.p90.toFixed(3)}</td></tr>`).join(''))}</div>
  <div class="card"><h3>Coverage — every one of ${D.counts.protocols} protocols accounted for</h3>
    ${table(['Bucket', 'Count', 'Note'], D.accounting.map((a) => `<tr><td>${esc(a.label)}</td><td>${a.count}</td><td>${esc(a.note)}</td></tr>`).join(''))}
    <p>Gas is priced per transaction on the protocol's cheapest listed chain (model estimates): ${D.gasTable.map((g) => `${esc(g.chain)} $${g.usd.toFixed(2)}`).join(', ')}; any other chain $0.50.</p></div>`;
}
function renderTraded() {
  $('#view-traded').innerHTML = `<h2>Traded — set aside, never ranked</h2>
  <div class="card"><p>${D.counts.traded} protocols record a token, so their market cap is the market's own value — this board has nothing to add, and mixing them into a pre-token ranking would be comparing a price with a guess. The ${D.counts.excluded_pretoken} pre-token protocols the house rule's own legs exclude are counted in the Method tab. Together with the ${D.counts.ranked} ranked rows, that accounts for all ${D.counts.protocols} protocols in the snapshot.</p>
  ${table(['Protocol', 'Market cap', 'TVL'], D.tradedTop.map((t) => `<tr><td><b>${esc(t.name)}</b><span class="sub">${esc(t.slug)}</span></td><td class="num">${money(t.mcap_usd)}</td><td class="num">${money(t.tvl_usd)}</td></tr>`).join(''))}
  <p>Top 25 traded protocols by market cap; the full set aside is ${D.counts.traded}.</p></div>`;
}
function show(view) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  $('#view-board').hidden = view !== 'board';
  $('#view-method').hidden = view !== 'method';
  $('#view-traded').hidden = view !== 'traded';
  if (view === 'method' && !$('#view-method').innerHTML) renderMethod();
  if (view === 'traded' && !$('#view-traded').innerHTML) renderTraded();
  if (view === 'board') renderBoard();
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.view === 'board' ? '#/' : '#/' + b.dataset.view; }));
function route() {
  const h = location.hash || '#/';
  document.body.classList.toggle('focus-detail', h.startsWith('#/detail/'));
  if (!h.startsWith('#/detail/')) $('#detail').hidden = true;
  if (h.startsWith('#/detail/')) { show('board'); renderDetail(decodeURIComponent(h.slice(9))); return; }
  if (h === '#/watchlist') { show('board'); $('#wl').checked = true; renderBoard(); return; }
  if (h === '#/method') { show('method'); return; }
  if (h === '#/traded') { show('traded'); return; }
  $('#wl').checked = false;
  show('board');
}
window.addEventListener('hashchange', route);
renderBoard();
route();
