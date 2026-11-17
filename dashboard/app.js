// Token Radar v2.3 — the dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail view with
// the model's own inputs and the protocol's netted farm plan, the live-token set and the
// method tab. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { q: '', category: 'all', chain: 'all', tab: 'board', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmt4(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(4); }

  // The model in one function: the page refits nothing, it replays the fitted curve from the
  // coefficients data.js carries, so the page's code and the board's data are visibly the
  // same arithmetic. log10(mcap) = intercept + slope x log10(TVL) + age_coef x log10(age+1).
  function curveOf(row) {
    var f = DATA.fit;
    var age = row.age_days === null || row.age_days === undefined ? 365 : row.age_days;
    var logv = f.intercept + f.slope * Math.log10(row.tvl_usd) + (f.age_coef === null ? 0 : f.age_coef * Math.log10(age + 1));
    return Math.max(1, Math.round(Math.pow(10, logv)));
  }

  function appendChild(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { appendChild(node, c); }); return; }
    if (typeof child === 'string') { node.appendChild(document.createTextNode(child)); return; }
    node.appendChild(child);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) appendChild(node, arguments[i]);
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'net') { av = a.farm_gas_total_usd; bv = b.farm_gas_total_usd; }
      else if (key === 'range') { av = a.rank_hi - a.rank_lo; bv = b.rank_hi - b.rank_lo; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { class: 'brand-name', text: 'TOKEN RADAR' }),
        el('span', { class: 'version', text: 'v2.3' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' · ' + DATA.comps + ' comps' })));
  }

  function lede() {
    var o = DATA.oos.chosen, f = DATA.oos.flat;
    return el('section', { class: 'lede' },
      el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by what a launch would be worth' }),
      el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor — every rankable one in the snapshot, not a top slice. Implied value is a fitted model, not a promise, and no token is promised.' }),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Traded comps fitted' }), el('b', { text: String(DATA.comps) })),
        el('div', { class: 'fact' }, el('span', { text: 'Blind holdout MAE' }), el('b', { text: o.blind.toFixed(3) }, el('small', { text: ' vs flat ' + f.blind.toFixed(3) }))),
        el('div', { class: 'fact' }, el('span', { text: 'Size-curve slope' }), el('b', { text: DATA.fit.slope.toFixed(3) }, el('small', { text: ' 95% CI ' + DATA.bootstrap.slope.lo.toFixed(2) + '–' + DATA.bootstrap.slope.hi.toFixed(2) }))),
        el('div', { class: 'fact' }, el('span', { text: 'Median rank range' }), el('b', { text: '±' + DATA.medianRankRange + ' ranks' }, el('small', { text: ' over 200 refits' })))),
      el('div', { class: 'method' },
        el('h2', { text: 'The model, in one paragraph' }),
        el('p', null,
          'Implied value is the fitted size curve: ',
          el('code', { text: 'log10(mcap) = ' + DATA.fit.intercept.toFixed(4) + ' + ' + DATA.fit.slope.toFixed(4) + ' × log10(TVL)' + (DATA.fit.age_coef !== null ? ' ' + (DATA.fit.age_coef < 0 ? '−' : '+') + ' ' + Math.abs(DATA.fit.age_coef).toFixed(4) + ' × log10(age + 1)' : '') }),
          ', fitted by least squares on ' + DATA.comps + ' traded tokens, one per ticker. The age term stays because the out-of-sample tests keep it; the growth term is dropped because they do not — its fitted sign flips across blind seeds.'),
        el('p', { class: 'sub', text: 'Out-of-sample error (log10 dollars, lower is better): blind holdout ' + o.blind.toFixed(4) + ' vs flat median ' + f.blind.toFixed(4) + ' · time-split ' + o.timeSplit.toFixed(4) + ' vs ' + f.timeSplit.toFixed(4) + ' · leave-one-out ' + o.loo.toFixed(4) + ' vs ' + f.loo.toFixed(4) + '. Full test table, bootstrap intervals and the coverage audit are on the Method tab.' })));
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); }));
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var sort = el('select', { id: 'sort', 'aria-label': 'Sort the board' },
      [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day growth'], ['age', 'Age'], ['net', 'Farm gas'], ['range', 'Rank range'], ['name', 'Name']].map(function (kv) {
        return el('option', { value: kv[0], text: kv[1], selected: kv[0] === state.sort ? 'selected' : null });
      }));
    sort.addEventListener('change', function () { state.sort = sort.value; writeHash(); render(); });
    var tabs = [['board', 'Pre-token board'], ['live', 'Live tokens'], ['method', 'Method']].map(function (kv) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === kv[0] ? 'true' : 'false', text: kv[1], onclick: function () { state.tab = kv[0]; writeHash(); render(); } });
    });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort by' }), sort),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabs)),
      el('span', { class: 'count', text: state.tab === 'board' ? filteredRows().length + ' of ' + DATA.board_size + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : 'How the board is built' }));
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col', class: 'num' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null));
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', { class: 'num', text: '#' + r.rank_lo + '–#' + r.rank_hi }),
        el('td', { class: 'num', text: '$' + r.farm_gas_total_usd.toFixed(2) + ' gas' }),
        el('td', null, el('span', { class: 'status', text: 'no token' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { id: 'board' },
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan. Rank range is the 5th–95th percentile rank over 200 bootstrap refits.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            el('th', { scope: 'col', text: 'Protocol' }),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('range', 'Rank range'),
            sortHeader('net', 'Farm gas'),
            el('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'trades' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.multiple === null ? 'n/a' : r.multiple.toFixed(3) + 'x' })));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Tokens that already trade: the market cap is a fact, not a model. These are the comps the size curve is fitted on, set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          tbody)));
  }

  function methodTab() {
    var o = DATA.oos, b = DATA.bootstrap, c = DATA.coverage;
    var selRows = DATA.selection.map(function (s) {
      return el('tr', { class: s.terms === DATA.fit.terms ? 'best' : null },
        el('td', { text: s.terms + (s.terms === DATA.fit.terms ? '  — kept' : '') }),
        el('td', { class: 'num', text: s.blind.toFixed(4) }),
        el('td', { class: 'num', text: s.timeSplit.toFixed(4) }),
        el('td', { class: 'num', text: s.loo.toFixed(4) }),
        el('td', { class: 'num', text: String(s.winsVsBase) + ' / 3' }));
    });
    return el('div', { class: 'method-grid' },
      el('div', { class: 'panel' },
        el('h3', { text: 'Term selection — the blind test decides' }),
        el('p', { text: 'A term is kept only when it wins at least 2 of the 3 out-of-sample tests against the model without it. The age term wins the blind mean and the time-split; the growth term wins only the time-split, and its fitted sign flips across blind seeds, so it is dropped.' }),
        el('table', { class: 'oos' },
          el('thead', null, el('tr', null, el('th', { text: 'Terms' }), el('th', { text: 'Blind' }), el('th', { text: 'Time-split' }), el('th', { text: 'Leave-one-out' }), el('th', { text: 'Wins vs TVL-only' }))),
          el('tbody', null, selRows)),
        el('p', { class: 'sub', text: 'Blind is the mean over 5 seeded 20% holdouts. Time-split fits on protocols listed before 2024-07-08 and tests on the newer half. Errors are mean absolute error in log10 dollars; lower is better.' })),
      el('div', { class: 'panel' },
        el('h3', { text: 'Bootstrap stability — 1,000 resamples' }),
        el('p', null, 'Slope 95% CI ', el('b', { text: b.slope.lo.toFixed(3) + ' – ' + b.slope.hi.toFixed(3) }), ', intercept ', el('b', { text: b.intercept.lo.toFixed(3) + ' – ' + b.intercept.hi.toFixed(3) }), (b.ageCoef ? [' , age coefficient ', el('b', { text: b.ageCoef.lo.toFixed(3) + ' – ' + b.ageCoef.hi.toFixed(3) })] : ''), '. The fitted multiple at one year of age:'),
        el('table', { class: 'oos' },
          el('thead', null, el('tr', null, el('th', { text: 'TVL' }), el('th', { text: 'Multiple 95% CI' }))),
          el('tbody', null,
            el('tr', null, el('td', { text: '$5M' }), el('td', { class: 'num', text: b.multiple5m.lo.toFixed(3) + 'x – ' + b.multiple5m.hi.toFixed(3) + 'x' })),
            el('tr', null, el('td', { text: '$50M' }), el('td', { class: 'num', text: b.multiple50m.lo.toFixed(3) + 'x – ' + b.multiple50m.hi.toFixed(3) + 'x' })),
            el('tr', null, el('td', { text: '$500M' }), el('td', { class: 'num', text: b.multiple500m.lo.toFixed(3) + 'x – ' + b.multiple500m.hi.toFixed(3) + 'x' })))),
        el('p', { class: 'sub', text: 'The curve is sublinear: bigger protocols trade at a smaller multiple of TVL. Rank ranges on the board come from 200 further refits; the median row moves ±' + DATA.medianRankRange + ' ranks.' })),
      el('div', { class: 'panel' },
        el('h3', { text: 'Coverage audit — where the 198 rows come from' }),
        el('p', { text: 'The snapshot holds ' + c.preTokenTotal + ' pre-token protocols. The board ranks all ' + c.rankable + ' that pass the watchlist rule: ' + c.watchlist + ' on the watchlist plus ' + c.belowFloor + ' below the $50M floor.' }),
        el('table', { class: 'oos' },
          el('thead', null, el('tr', null, el('th', { text: 'Set aside by the rule' }), el('th', { text: 'Count' }))),
          el('tbody', null,
            el('tr', null, el('td', { text: 'CEX' }), el('td', { class: 'num', text: String(c.excludedCex) })),
            el('tr', null, el('td', { text: 'Bridge / liquid staking / restaking' }), el('td', { class: 'num', text: String(c.excludedBridgeCat) })),
            el('tr', null, el('td', { text: 'Versioned pool names' }), el('td', { class: 'num', text: String(c.excludedVersioned) })),
            el('tr', null, el('td', { text: 'Wrapped / staked in the name' }), el('td', { class: 'num', text: String(c.excludedWrappedWord) })),
            el('tr', null, el('td', { text: 'Exchange-prefixed names' }), el('td', { class: 'num', text: String(c.excludedExchangePrefix) })))),
        el('p', { class: 'sub', text: 'A protocol the list leaves out is no worse a subject — it is a product of a token that already trades, a versioned pool, or an exchange product, not a protocol still waiting on a launch of its own.' })),
      el('div', { class: 'panel' },
        el('h3', { text: 'Farm economics — gas by chain' }),
        el('p', { text: 'Every plan is priced on the cheapest chain the protocol runs on that this table covers. Gas figures are estimates per transaction, in dollars; a chain with no estimate is priced at $1.00 and the plan says so.' }),
        el('ul', { class: 'gas-list' }, DATA.gasTable.map(function (g) { return el('li', { text: g.chain + ': $' + g.usd.toFixed(2) }); }))));
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = curveOf(row);
    var steps = row.farm_steps.map(function (s, i) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      var isNet = i === row.farm_steps.length - 1;
      return el('li', { class: isNet ? 'net' : null }, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
    });
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · records no token' })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' (tested, dropped)' })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Curve value' }), el('b', { class: 'num', text: fmtUsd(row.curve_value_usd) })),
        el('div', null, el('span', { text: 'Rank range over 200 refits' }), el('b', { class: 'num', text: '#' + row.rank_lo + '–#' + row.rank_hi })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.curve_value_usd ? ', the same number board.json carries as the curve value.' : ', which differs from the board: the data would be stale.') + ' The implied value is the curve value, nudged one dollar below the row above it only where two rows tie. This is an estimate, not a price.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — netted to the dollar' }),
      el('p', { class: 'sub', text: 'Priced on ' + row.cheapest_chain + ' at $' + row.gas_per_tx_usd.toFixed(2) + ' of gas per transaction' + (row.gas_estimated ? ' (estimate).' : ' (default — no estimate for this chain in the gas table).') + ' The net line at the end is the whole cost: gas sunk, capital locked and withdrawable, minutes of your time.' }),
      el('ol', { class: 'steps' }, steps)));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'method') shell.appendChild(methodTab());
    else shell.appendChild(boardTable());
    shell.appendChild(el('footer', { text: 'Implied value is the model\u2019s claim, never make.fun\u2019s and never a price. The snapshot is DefiLlama\u2019s protocol index as fetched ' + DATA.as_of + '; it records no token for these protocols, which is not proof they have none. Gas figures are estimates. Nothing here is financial advice.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
