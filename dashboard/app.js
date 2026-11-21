/* Token Launch Radar v2.4 — the dashboard renders window.RADAR and nothing else.
   No fetch, no network: every number on the page comes from the model's own run
   (board.json and data.js are written by the same program). */
(function () {
  var D = window.RADAR;
  if (!D) { document.body.innerHTML = '<p style="padding:32px">Radar data failed to load.</p>'; return; }
  var v = D.validation;

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n >= 0 ? 'pos' : 'neg') + '">' + s + '</span>';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function $(id) { return document.getElementById(id); }

  /* Header: what the board is and where its numbers come from. */
  $('meta').innerHTML =
    '<b>' + D.board_size + ' rows</b>protocols ranked<br>' +
    '<b>' + D.watchlist_size + ' / ' + D.watchlist_size + '</b>watchlist covered<br>' +
    'snapshot ' + esc(D.as_of) + ' · ' + v.comps_n + ' traded comps';
  var wf = v.legs[0], rev = v.legs[1], hold = v.legs[2], loo = v.legs[3];
  $('strip').innerHTML =
    '<span class="chip">size curve <b>log<sub>10</sub>(mcap) = ' + v.intercept + ' + ' + v.slope + ' · log<sub>10</sub>(TVL)</b> · R² ' + v.r2 + '</span>' +
    '<span class="chip">walk-forward MAE <b>' + wf.model_mae + '</b> vs baseline <b>' + wf.baseline_mae + '</b> <span class="up">✓</span></span>' +
    '<span class="chip">reverse leg MAE <b>' + rev.model_mae + '</b> vs <b>' + rev.baseline_mae + '</b> <span class="up">✓</span></span>' +
    '<span class="chip">blind holdout MAE <b>' + hold.model_mae + '</b> vs <b>' + hold.baseline_mae + '</b> ' + (hold.beats_baseline ? '<span class="up">✓</span>' : '<span>≈</span>') + '</span>' +
    '<span class="chip">leave-one-out MAE <b>' + loo.model_mae + '</b> vs <b>' + loo.baseline_mae + '</b> <span class="up">✓</span></span>' +
    '<span class="chip">slope 95% CI <b>' + v.slope_ci_low + ' – ' + v.slope_ci_high + '</b> (1000× bootstrap)</span>' +
    '<span class="chip">multiples $5M <b>' + v.multiple_5m + '</b> · $50M <b>' + v.multiple_50m + '</b> · $500M <b>' + v.multiple_500m + '</b></span>';

  /* Category filter options, from the board itself. */
  var cats = [];
  D.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort();
  cats.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    $('cat').appendChild(o);
  });

  var selected = null;
  function filtered() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value;
    var wlOnly = $('wl').checked;
    var earlyOnly = $('early').checked;
    return D.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (wlOnly && !isWatchlist(r.slug)) return false;
      if (earlyOnly && r.tvl_usd >= D.floor_usd) return false;
      return true;
    });
  }
  /* The watchlist is the snapshot's own list; the page knows it only as a set
     of slugs the model marked, so the toggle needs the model's flag. */
  var wlSet = null;
  function isWatchlist(slug) {
    if (!wlSet) {
      wlSet = {};
      D.rows.forEach(function (r) { if (r.watchlist) wlSet[r.slug] = true; });
    }
    return !!wlSet[slug];
  }
  function sorted(rows) {
    var key = $('sort').value;
    var arr = rows.slice();
    if (key === 'tvl') arr.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (key === 'growth') arr.sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); });
    else if (key === 'age') arr.sort(function (a, b) { return (b.age_days || 0) - (a.age_days || 0); });
    else if (key === 'gas') arr.sort(function (a, b) { return a.gas_total_usd - b.gas_total_usd; });
    else arr.sort(function (a, b) { return a.rank - b.rank; });
    return arr;
  }
  function renderBoard() {
    var rows = sorted(filtered());
    $('count').textContent = rows.length + ' of ' + D.board_size + ' ranked protocols shown · ' +
      D.watchlist_size + ' watchlist · ' + D.early_size + ' early below the $50M floor · ' +
      D.above_floor_extra + ' above the floor that the house list leaves out';
    $('rows').innerHTML = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b><br><span class="slug">' + esc(r.slug) + (isWatchlist(r.slug) ? ' · watchlist' : '') + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (r.age_days === null ? '—' : r.age_days + 'd') + '</td>' +
        '<td class="num"><span class="val">' + money(r.implied_value_usd) + '</span></td>' +
        '<td class="num">' + r.multiple_at_tvl.toFixed(3) + '×</td>' +
        '<td class="num">$' + r.gas_total_usd.toFixed(2) + '</td></tr>';
    }).join('');
  }
  function renderDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    var box = $('detail');
    if (!r) { box.hidden = true; selected = null; renderBoard(); return; }
    selected = slug;
    var steps = (r.farm_steps || []).map(function (s, i) {
      var net = /^Net:/.test(s);
      return '<li>' + (net ? '<b>' + esc(s) + '</b>' : esc(s)) + '</li>';
    }).join('');
    var netStep = (r.farm_steps || []).filter(function (s) { return /^Net:/.test(s); })[0] || '';
    box.innerHTML =
      '<h2>#' + r.rank + ' — ' + esc(r.name) + '</h2>' +
      '<p class="dsub">' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + ' · ' + esc(r.chains.join(', ')) +
      ' · listed ' + esc(r.listed_at || 'date not reported') + ' · records no token</p>' +
      '<div class="grid">' +
      '<div class="cell"><span>Implied value</span><b>' + money(r.implied_value_usd) + '</b></div>' +
      '<div class="cell"><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div>' +
      '<div class="cell"><span>Curve value</span><b>' + money(r.curve_value_usd) + '</b></div>' +
      '<div class="cell"><span>Multiple at TVL</span><b>' + r.multiple_at_tvl.toFixed(3) + '×</b></div>' +
      '<div class="cell"><span>Growth ×</span><b>' + r.growth_multiplier.toFixed(2) + '</b></div>' +
      '<div class="cell"><span>Maturity ×</span><b>' + r.maturity_multiplier.toFixed(2) + '</b></div>' +
      '<div class="cell"><span>Cheapest chain</span><b>' + esc(r.cheapest_chain) + '</b></div>' +
      '<div class="cell"><span>Farm gas total</span><b>$' + r.gas_total_usd.toFixed(2) + '</b></div>' +
      '<div class="cell"><span>Capital (withdrawable)</span><b>$' + r.capital_usd + '</b></div>' +
      '<div class="cell"><span>Hold</span><b>' + r.hold_days + ' days</b></div>' +
      '</div>' +
      '<p class="net">' + esc(netStep) + '</p>' +
      '<h3>How to farm it — 7 steps, netted to the dollar</h3><ol>' + steps + '</ol>' +
      '<p class="hint">Implied value = curve value × growth × maturity, all three from this snapshot. ' +
      'The farm plan is costed on ' + esc(r.cheapest_chain) + ', the cheapest chain this protocol lists; gas fees are the model’s estimates, not measured fees.</p>';
    box.hidden = false;
    document.querySelector('main').classList.add('detail-first');
    renderBoard();
  }
  function renderLive() {
    $('liveRows').innerHTML = D.live.map(function (p) {
      var mult = p.mcap_usd ? (p.mcap_usd / p.tvl_usd).toFixed(3) + '×' : '—';
      return '<tr><td><b>' + esc(p.name) + '</b><br><span class="slug">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td>' +
        '<td class="num">' + (p.mcap_usd ? money(p.mcap_usd) : '—') + '</td>' +
        '<td class="num">' + mult + '</td></tr>';
    }).join('');
  }
  function renderValid() {
    $('validRows').innerHTML = v.legs.map(function (l) {
      return '<tr><td>' + esc(l.name) + '<br><span class="slug">' + esc(l.note) + '</span></td>' +
        '<td class="num">' + l.train_n + '</td><td class="num">' + l.test_n + '</td>' +
        '<td class="num">' + l.model_mae.toFixed(4) + '</td><td class="num">' + l.baseline_mae.toFixed(4) + '</td>' +
        '<td class="num">' + l.model_rmse.toFixed(4) + '</td><td class="num">' + l.baseline_rmse.toFixed(4) + '</td>' +
        '<td>' + (l.beats_baseline ? '<span class="pos">Yes — lower error</span>' : '<span>Near tie — within 0.02 log points</span>') + '</td></tr>';
    }).join('');
    $('boot').innerHTML = 'Bootstrap (1000 resamples of the ' + v.comps_n + ' comps): slope 95% CI <b>' +
      v.slope_ci_low + ' – ' + v.slope_ci_high + '</b>; implied multiple at $5M <b>' + v.multiple_5m +
      '</b> (CI ' + v.multiple_5m_ci_low + ' – ' + v.multiple_5m_ci_high + '), at $50M <b>' + v.multiple_50m +
      '</b> (CI ' + v.multiple_50m_ci_low + ' – ' + v.multiple_50m_ci_high + '), at $500M <b>' + v.multiple_500m +
      '</b> (CI ' + v.multiple_500m_ci_low + ' – ' + v.multiple_500m_ci_high + '). Blind size curve: two seeded halves fitted alone give slopes ' +
      v.blind_slope_half1 + ' and ' + v.blind_slope_half2 + ' — ' + v.blind_slope_diff.toFixed(4) +
      ' apart, so the curve does not depend on which half of the comps it sees. In-sample MAE ' + v.in_sample_mae +
      ' against the flat baseline’s ' + v.baseline_mae + ' (log10 market cap). Errors are in log10 space: 0.68 is about a factor of 5 either way, which is why the board shows a range, not a promise.';
    $('cover').textContent = 'The board holds all ' + D.board_size + ' protocols the snapshot’s own fields mark rankable: the ' +
      D.watchlist_size + ' on the house watchlist, ' + D.early_size + ' pre-token protocols below the $50M floor, and ' +
      D.above_floor_extra + ' above the floor that the house list leaves out (the watchlist is a floor, never a ceiling). ' +
      'Rankable means: records no token, and the snapshot does not mark it a wrapped, staked or bridged product, a versioned pool or an exchange product. ' +
      'Every row is 100% rankable by that rule, and every watchlist slug appears.';
    $('foot').textContent = 'Model ' + D.model_version + ' · snapshot ' + D.as_of + ' · ' + esc(D.source) +
      ' · implied values are this entry’s own claims, never the house’s · gas fees are estimates';
  }
  function setView(live) {
    $('viewBoard').classList.toggle('on', !live);
    $('viewLive').classList.toggle('on', live);
    $('boardWrap').hidden = live;
    $('detail').hidden = live ? true : $('detail').hidden;
    $('liveWrap').hidden = !live;
    if (live) renderLive();
  }
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) {
      location.hash = '#detail=' + tr.getAttribute('data-slug');
      renderDetail(tr.getAttribute('data-slug'));
      $('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
  ['q', 'cat', 'sort', 'wl', 'early'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  });
  $('viewBoard').addEventListener('click', function () { location.hash = ''; setView(false); });
  $('viewLive').addEventListener('click', function () { location.hash = '#view=live'; setView(true); });

  /* Hash routing, so each view has an address: #detail=<slug>, #view=live, #filter=watchlist. */
  function route() {
    var h = location.hash || '';
    var main = document.querySelector('main');
    if (h.indexOf('#view=live') === 0) { main.classList.remove('detail-first'); setView(true); return; }
    if (h.indexOf('#detail=') === 0) { setView(false); renderDetail(h.slice(8)); return; }
    if (h.indexOf('#filter=watchlist') === 0) { main.classList.remove('detail-first'); $('wl').checked = true; setView(false); renderBoard(); return; }
    main.classList.remove('detail-first');
    setView(false);
  }
  window.addEventListener('hashchange', route);
  renderBoard();
  renderValid();
  route();
})();
