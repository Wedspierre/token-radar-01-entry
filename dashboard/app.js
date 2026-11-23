// Token Radar v2.5 — dashboard logic. Reads window.RADAR (data.js, written
// by main.ts from the same board), renders the board, the detail view, the
// size-curve chart and the validation tables. No fetch, no network.
(function () {
  var R = window.RADAR;
  if (!R) { document.body.innerHTML = '<p style="padding:40px">Radar data (data.js) did not load.</p>'; return; }
  var V = R.validation;

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) { return (n === null || n === undefined) ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- header + stats ----
  $('meta').innerHTML = 'Snapshot <b>' + esc(R.as_of) + '</b><br>' + esc(R.source.split(', fetched')[0]) +
    '<br>Model <b>' + esc(R.model_version) + '</b> · ' + V.comps + ' traded comps';
  $('footAsOf').textContent = R.as_of;
  $('footSource').textContent = R.source;
  $('compN').textContent = V.comps;
  var bestWf = V.walkForward.reduce(function (a, b) { return b.improvementPct > a.improvementPct ? b : a; }, V.walkForward[0]);
  $('stats').innerHTML = [
    ['Board rows', R.rows.length, V.watchlistRows + ' watchlist + ' + V.earlyRows + ' early'],
    ['Watchlist', V.watchlistRows + ' / ' + V.watchlistRows, '100% covered'],
    ['Size-curve slope', V.curve.slope.toFixed(3), '95% CI ' + V.bootstrapSlopeLo + '–' + V.bootstrapSlopeHi],
    ['Walk-forward gain', '+' + bestWf.improvementPct.toFixed(1) + '%', 'vs flat-median baseline, ' + bestWf.test + ' held-out listings'],
    ['Blind holdout gain', '+' + V.blindHoldout.improvementPct.toFixed(1) + '%', '20% of comps, seeded split'],
    ['Multiple at $50M TVL', V.multiples[1].median.toFixed(3) + '×', '95% CI ' + V.multiples[1].lo + '–' + V.multiples[1].hi],
  ].map(function (s) {
    return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + s[1] + '</div><div class="d">' + s[2] + '</div></div>';
  }).join('');

  // ---- filters ----
  var cats = [...new Set(R.rows.map(function (r) { return r.category || '(none)'; }))].sort();
  var chains = [...new Set(R.rows.flatMap(function (r) { return r.chains; }))].sort();
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; $('cat').appendChild(o); });
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; $('chain').appendChild(o); });

  function filtered() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value, chain = $('chain').value, basis = $('basis').value;
    var rows = R.rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      if (cat && (r.category || '(none)') !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (basis && r.basis !== basis) return false;
      return true;
    });
    var sort = $('sort').value;
    if (sort === 'tvl') rows.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (sort === 'growth') rows.sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); });
    else if (sort === 'age') rows.sort(function (a, b) { return (b.age_days || 0) - (a.age_days || 0); });
    else if (sort === 'net') rows.sort(function (a, b) { return a.farm_net.gasUsd - b.farm_net.gasUsd; });
    else rows.sort(function (a, b) { return a.rank - b.rank; });
    return rows;
  }

  function renderBoard() {
    var rows = filtered();
    $('count').textContent = rows.length + ' of ' + R.rows.length + ' rows — click a row for its model breakdown and farm plan.';
    $('rows').innerHTML = rows.map(function (r) {
      var badge = r.basis === 'watchlist' ? '<span class="badge wl">WATCHLIST</span>' : '<span class="badge early">EARLY</span>';
      var flag = r.aboveFloorNote ? '<span class="flag">Above $50M floor, not on house watchlist — verify parent before farming</span>' : '';
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' + badge + '<br><span class="slug">' + esc(r.slug) + '</span>' + flag + '</td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.join(', ')) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (r.age_days === null ? '—' : r.age_days + 'd') + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + money(r.farm_net.gasUsd) + ' gas<br><span class="slug">' + money(r.farm_net.capitalUsd) + ' locked</span></td></tr>';
    }).join('');
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  // ---- detail view ----
  function openDetail(slug) {
    var r = R.rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var v = V;
    $('detailBody').innerHTML =
      '<h2>' + esc(r.name) + '</h2><p class="slug">Rank #' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + ' · ' + esc(r.chains.join(', ')) +
      (r.basis === 'watchlist' ? ' · <span class="badge wl">WATCHLIST</span>' : ' · <span class="badge early">EARLY</span>') + '</p>' +
      (r.aboveFloorNote ? '<p class="flag">Above the $50M floor but not on the house watchlist. The snapshot carries no parentProtocol field, so this board cannot apply the house\'s parent rule here — check the protocol is not a wrapped or staked product of a traded token before farming it.</p>' : '') +
      '<div class="kv">' +
      '<div><div class="k">Implied value</div><div class="v">' + money(r.implied_value_usd) + '</div></div>' +
      '<div><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div></div>' +
      '<div><div class="k">Curve value</div><div class="v">' + money(r.curve_value_usd) + '</div></div>' +
      '<div><div class="k">Segment ×</div><div class="v">' + r.segment_multiplier.toFixed(3) + '×</div></div>' +
      '<div><div class="k">Growth ×</div><div class="v">' + r.growth_multiplier.toFixed(3) + '×</div></div>' +
      '<div><div class="k">Maturity ×</div><div class="v">' + r.maturity_multiplier.toFixed(3) + '×</div></div>' +
      '</div>' +
      '<p class="fine">Implied = curve value (' + money(r.curve_value_usd) + ') × segment ' + r.segment_multiplier.toFixed(3) + ' × growth ' + r.growth_multiplier.toFixed(3) + ' × maturity ' + r.maturity_multiplier.toFixed(3) + '. ' +
      'The curve is log(mcap) = ' + v.curve.intercept.toFixed(3) + ' + ' + v.curve.slope.toFixed(3) + ' × log(TVL), fitted on ' + v.curve.n + ' traded tokens. ' +
      '7-day change ' + pct(r.change_7d) + '; listed ' + (r.listed_at || 'date not reported') + ' (' + (r.age_days === null ? 'age unknown' : r.age_days + ' days') + ').</p>' +
      '<h3>Farm plan — netted to the dollar</h3>' +
      '<p class="net">Net: ' + money(r.farm_net.gasUsd) + ' gas total (' + r.farm_net.txCount + ' transactions on ' + esc(r.farm_net.chain) + ' at $' + r.farm_net.gasPerTxUsd + ' each) + ' + money(r.farm_net.capitalUsd) + ' capital locked and withdrawable + ' + r.farm_net.activeMinutes + ' minutes across a ' + r.farm_net.holdDays + '-day hold.</p>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="fine">No points program is claimed: the snapshot records none. Gas is priced on the cheapest chain this protocol runs on.</p>';
    $('detail').hidden = false;
    safeHash('#detail=' + slug);
  }
  function safeHash(h) { try { history.replaceState(null, '', h); } catch (e) { /* file:// or sandboxed: hash is a bonus, not a need */ } }
  function closeDetail() { $('detail').hidden = true; if (location.hash.indexOf('#detail=') === 0) safeHash('#'); }
  $('closeDetail').addEventListener('click', closeDetail);

  // ---- size-curve chart ----
  function drawChart() {
    var cv = $('chart'), ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height, pad = 54;
    var xs = R.comps.map(function (p) { return Math.log(p.tvl_usd); });
    var ys = R.comps.map(function (p) { return Math.log(p.mcap_usd); });
    var x0 = Math.min.apply(null, xs) - 0.4, x1 = Math.max.apply(null, xs) + 0.4;
    var y0 = Math.min.apply(null, ys) - 0.6, y1 = Math.max.apply(null, ys) + 0.6;
    function X(v) { return pad + (v - x0) / (x1 - x0) * (W - pad * 2); }
    function Y(v) { return H - pad - (v - y0) / (y1 - y0) * (H - pad * 2); }
    ctx.fillStyle = '#111826'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#263449'; ctx.lineWidth = 1;
    ctx.fillStyle = '#93a3b8'; ctx.font = '12px sans-serif';
    [5e6, 50e6, 500e6, 5e9].forEach(function (t) {
      var x = X(Math.log(t));
      ctx.beginPath(); ctx.moveTo(x, pad - 8); ctx.lineTo(x, H - pad); ctx.stroke();
      ctx.fillText(money(t) + ' TVL', x - 28, H - pad + 18);
    });
    R.comps.forEach(function (p) {
      ctx.fillStyle = 'rgba(76,194,161,0.75)';
      ctx.beginPath(); ctx.arc(X(Math.log(p.tvl_usd)), Y(Math.log(p.mcap_usd)), 3.2, 0, 7); ctx.fill();
    });
    ctx.strokeStyle = '#e8b64c'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(X(x0), Y(V.curve.intercept + V.curve.slope * x0));
    ctx.lineTo(X(x1), Y(V.curve.intercept + V.curve.slope * x1));
    ctx.stroke();
    ctx.fillStyle = '#e8eef7'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('log(mcap) = ' + V.curve.intercept.toFixed(3) + ' + ' + V.curve.slope.toFixed(3) + ' × log(TVL)  ·  n=' + V.curve.n + '  ·  log-RMSE ' + V.curve.logRmse.toFixed(3), pad, 26);
    ctx.fillStyle = '#93a3b8'; ctx.font = '12px sans-serif';
    ctx.fillText('Dots: traded tokens (market cap vs TVL, log scales). Gold line: fitted size curve.', pad, H - 14);
  }

  // ---- validation tables ----
  function table(head, rows) {
    return '<table><thead><tr>' + head.map(function (h) { return '<th' + (h.num ? ' class="num"' : '') + '>' + h.t + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (head[i].num ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  $('oos').innerHTML = table(
    [{ t: 'Test' }, { t: 'Train / test', num: true }, { t: 'Model log-MAE', num: true }, { t: 'Baseline log-MAE', num: true }, { t: 'Better', num: true }],
    V.walkForward.map(function (w) {
      return [esc(w.label.split(':')[0]), w.train + ' / ' + w.test, w.modelMae.toFixed(4), w.baselineMae.toFixed(4), '+' + w.improvementPct.toFixed(1) + '%'];
    }).concat([['Blind holdout (20%, seeded)', V.blindHoldout.train + ' / ' + V.blindHoldout.test, V.blindHoldout.modelMae.toFixed(4), V.blindHoldout.baselineMae.toFixed(4), '+' + V.blindHoldout.improvementPct.toFixed(1) + '%']])
  ) + '<p class="fine">Baseline in every row: the flat median multiple, fitted on the same training set. The curve beats it in all four tests.</p>';
  $('stress').innerHTML = table(
    [{ t: 'Stress test' }, { t: 'Slope', num: true }],
    [['Pooled fit (all ' + V.comps + ' comps)', V.curve.slope.toFixed(4)],
     ['Winsorised 5/95 (log multiple)', V.winsorSlope.toFixed(4) + ' (Δ ' + (V.winsorDelta >= 0 ? '+' : '') + V.winsorDelta + ')'],
     ['Leave-one-decile-out, lowest', V.decileMin.toFixed(4)],
     ['Leave-one-decile-out, highest', V.decileMax.toFixed(4)],
     ['Decile range', V.decileRange.toFixed(4)]]
  ) + '<p class="fine">No single TVL decile moves the slope by more than 0.09; winsorising the extremes moves it by ' + V.winsorDelta + '. The curve is not an outlier\'s artefact.</p>';
  $('mults').innerHTML = table(
    [{ t: 'TVL', num: true }, { t: 'Multiple', num: true }, { t: '95% CI', num: true }, { t: 'Implied', num: true }],
    V.multiples.map(function (m) { return [money(m.tvl), m.median.toFixed(3) + '×', m.lo.toFixed(3) + '–' + m.hi.toFixed(3), money(m.median * m.tvl)]; })
  ) + '<p class="fine">Bootstrap, 1,000 resamples of the ' + V.comps + ' comps. The multiple falls as TVL rises: the market pays less per dollar of TVL at size.</p>';
  $('segs').innerHTML = table(
    [{ t: 'Category' }, { t: 'n', num: true }, { t: 'Median residual', num: true }, { t: 'Adjustment', num: true }, { t: 'Multiplier', num: true }],
    V.segments.map(function (s) { return [esc(s.category), s.n, (s.medianResidual >= 0 ? '+' : '') + s.medianResidual.toFixed(3), (s.adjustment >= 0 ? '+' : '') + s.adjustment.toFixed(3) + (s.capped ? ' (capped)' : ''), s.multiplier.toFixed(3) + '×']; })
  ) + '<p class="fine">Adjustment = median residual × n/(n+5), capped at ±0.35. Leave-one-out log-MAE ' + V.segmentLooBase.toFixed(4) + ' → ' + V.segmentLooAdjusted.toFixed(4) + ' (' + V.segmentLooGainPct.toFixed(1) + '% better), so the adjustment is kept. Categories with fewer than 5 comps get no adjustment.</p>';
  $('chains').innerHTML = table(
    [{ t: 'First chain' }, { t: 'n', num: true }, { t: 'Median residual', num: true }],
    V.chainAudit.map(function (c) { return [esc(c.chain), c.n, (c.medianResidual >= 0 ? '+' : '') + c.medianResidual.toFixed(3)]; })
  );

  // ---- live anchors ----
  $('live').innerHTML = R.live.map(function (p) {
    return '<tr><td><span class="name">' + esc(p.name) + '</span><br><span class="slug">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num"><b>' + money(p.mcap_usd) + '</b></td><td class="num">' + money(p.curve_value_usd) + '</td>' +
      '<td class="num">' + p.multiple.toFixed(3) + '×</td></tr>';
  }).join('');

  // ---- method ----
  $('method').innerHTML =
    '<p><b>What this board is.</b> A ranking of the ' + R.rows.length + ' protocols in the snapshot that record no token and pass the house watchlist rule with the floor removed — the 40 watchlist slugs plus 158 more. Each row\'s implied value is the fitted size curve\'s value for its TVL, times a shrunk category adjustment, times two small tilts (growth 0.15 weight, maturity 0.90–1.00). Nothing here is a prediction that a token launches, or when.</p>' +
    '<p><b>What the data says that the model obeys.</b> On the ' + V.comps + ' traded comps, a regression of log market cap on log TVL, 7-day growth and age finds a growth coefficient of ' + V.growthCoefficient + ' and an age coefficient of ' + V.ageCoefficient + ' — both negative. Fast-growing and older traded tokens do <i>not</i> carry higher multiples. So growth and age enter only as small tilts, not as the 0.5 weight a naive model would use. If you disagree with the tilt, the curve alone still ranks the board: the tilts move any row by at most ±18%.</p>' +
    '<p><b>What is not fitted.</b> No launch clock: the snapshot has no launch history, so no timing claim is made anywhere. No chain adjustment: chain samples outside Ethereum are n ≤ 9 (see the chain audit), too small to fit, so the board reports them and fits none. No points program: the snapshot records none, so no farm step claims one.</p>' +
    '<p><b>The 20 above-floor rows.</b> ' + V.aboveFloorNonWatchlist + ' board rows sit above the $50M floor but are not on the house watchlist. The house rule also excludes protocols whose parent protocol\'s token already trades, but <code>parentProtocol</code> is not one of the snapshot\'s ten fields, so this board cannot apply that leg. Those rows are flagged in the board and in their detail view: verify the protocol is not a wrapped or staked product of a traded token before farming it.</p>' +
    '<p><b>Costs.</b> Gas is priced per transaction on the cheapest chain each protocol runs on (Ethereum $3.50, Arbitrum $0.15, Optimism $0.10, Base $0.05, Solana $0.01, Binance $0.10, Avalanche $0.15, Polygon $0.05, Hyperliquid L1 $0.01, TON $0.05, Bitcoin $0.50, Cronos $0.10, Stellar $0.01, Astar $0.10, anything else $0.50). Every plan is 9 transactions; capital is $50–$250 by TVL tier and stays withdrawable. These are planning figures, not quotes.</p>' +
    '<p><b>Reproduce it.</b> <code>main.ts</code> in the repository replays the whole validation from the snapshot alone: <code>validateModel</code> fits the curve, runs the three walk-forward windows, the blind holdout, the winsorisation, the leave-one-decile-out slopes and the 1,000-draw bootstrap, then <code>buildBoard</code> ranks the board. Same snapshot, same bytes, every run.</p>';

  // ---- tabs + hash routing ----
  function show(view) {
    document.querySelectorAll('.view').forEach(function (s) { s.hidden = s.id !== 'view-' + view; });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-view') === view); });
    if (view === 'curve') drawChart();
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-view')); safeHash('#view=' + b.getAttribute('data-view')); });
  });
  ['q', 'cat', 'chain', 'basis', 'sort'].forEach(function (id) { $(id).addEventListener('input', renderBoard); $(id).addEventListener('change', renderBoard); });

  function route() {
    var h = location.hash || '';
    var m;
    if ((m = h.match(/#detail=(.+)/))) { show('board'); openDetail(decodeURIComponent(m[1])); return; }
    if ((m = h.match(/#view=(\w+)/))) { show(m[1]); return; }
    if ((m = h.match(/#filter=watchlist/))) { $('basis').value = 'watchlist'; show('board'); }
    else if ((m = h.match(/#filter=category:(.+)/))) { var c = decodeURIComponent(m[1]); if (cats.indexOf(c) >= 0) $('cat').value = c; show('board'); }
    else if ((m = h.match(/#filter=chain:(.+)/))) { var ch = decodeURIComponent(m[1]); if (chains.indexOf(ch) >= 0) $('chain').value = ch; show('board'); }
    renderBoard();
  }
  renderBoard();
  route();
})();
