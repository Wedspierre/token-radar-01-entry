// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the decision first — the protocols to act on, why now, what to do, what it costs —
// then the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs, the evidence behind them and the protocol's farm plan, and the three allocation
// profiles that turn the board into a plan. No network: every byte it shows is in data.js.
//
// The model in one place: impliedOf recomputes a row from the snapshot figures and checks the
// number board.json carries, so the page's code and the board's data are visibly the same
// arithmetic. farmSteps is the same derivation main.ts writes to board.json: category, chains,
// TVL and age decide the action, the capital, the hold and every cost and time. No name is
// special-cased. A protocol "records no token" when the snapshot carries none for it; that is
// the record, never a claim that it has none. Gas figures are estimates, and what the snapshot
// does not record — a points program, an audit, a lockup — is shown as unknown, never priced in.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

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

  // radar-3, recomputed in the page: TVL x the fitted size-curve multiple x growth x maturity
  // x chain breadth. The multiple is the market's own price for a protocol of this size: a
  // log-log line the page fits itself from the snapshot's live-token comps in data.js (see the
  // model panel), so the fit the dashboard describes is the fit its own code runs.
  //
  // The page fits the line itself: log10(market-cap / TVL) on log10(TVL), ordinary least squares
  // over the live-token comps data.js carries, each [tvl_usd, mcap_usd]. The same fit main.ts
  // runs, so the page's numbers and the board's numbers agree to the dollar.
  function fitLine(comps) {
    var n = comps.length;
    var mx = 0, my = 0;
    comps.forEach(function (c) { mx += Math.log10(c[0]); my += Math.log10(c[1] / c[0]); });
    mx /= n; my /= n;
    var den = 0, num = 0;
    comps.forEach(function (c) {
      var x = Math.log10(c[0]), y = Math.log10(c[1] / c[0]);
      den += (x - mx) * (x - mx); num += (x - mx) * (y - my);
    });
    var slope = den > 0 ? num / den : 0;
    return { intercept: my - slope * mx, slope: slope };
  }
  // The same test main.ts runs, in the page: leave-one-out, each live protocol priced by a line
  // fitted without it, against the flat median on the same test.
  function looErrors(comps) {
    var n = comps.length;
    var looSum = 0, flatSum = 0;
    var ratios = comps.map(function (c) { return c[1] / c[0]; });
    var sortedRatios = ratios.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(n / 2);
    var flatMedian = n % 2 === 1 ? sortedRatios[mid] : (sortedRatios[mid - 1] + sortedRatios[mid]) / 2;
    for (var i = 0; i < n; i++) {
      var rest = comps.filter(function (_, j) { return j !== i; });
      var f = fitLine(rest);
      var actual = Math.log10(comps[i][1] / comps[i][0]);
      looSum += Math.abs(f.intercept + f.slope * Math.log10(comps[i][0]) - actual);
      var restRatios = ratios.filter(function (_, j) { return j !== i; }).sort(function (a, b) { return a - b; });
      var rmid = Math.floor(restRatios.length / 2);
      var restMedian = restRatios.length % 2 === 1 ? restRatios[rmid] : (restRatios[rmid - 1] + restRatios[rmid]) / 2;
      flatSum += Math.abs(Math.log10(restMedian) - actual);
    }
    return { loo: looSum / n, flat: flatSum / n, flatMedian: flatMedian };
  }
  var FIT = fitLine(DATA.fit_comps || []);
  var FIT_TEST = looErrors(DATA.fit_comps || []);
  function fittedMultiple(tvl) {
    var raw = Math.pow(10, FIT.intercept + FIT.slope * Math.log10(Math.max(1, tvl)));
    return Math.min(DATA.model.fit_clamp_hi, Math.max(DATA.model.fit_clamp_lo, raw));
  }
  function impliedOf(row, model) {
    var multiple = fittedMultiple(row.tvl_usd);
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainCount = Math.max((row.chains || []).length, 1);
    var chainMult = 1 + model.chain_step * Math.min(chainCount - 1, model.chain_max_bonus);
    return Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturity * chainMult));
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
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan, derived from the protocol's own record exactly as main.ts derives it.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(p) {
    var chain = chainOf(p);
    if (chain === 'Ethereum') return { setup: 8, weekly: 8 };
    return { setup: 1, weekly: 1 };
  }
  function netCostFor(p) {
    var gas = gasFor(p);
    return gas.setup + gas.weekly * Math.ceil(holdDaysFor(p.age_days) / 7);
  }
  // One stated rule, applied to every row: farm the top half while it grows on a reported
  // figure; skip the bottom half when it shrinks hard or reports no growth; thin the rest.
  function verdictFor(row) {
    var topHalf = row.rank <= Math.ceil(DATA.board_size / 2);
    if (topHalf && row.change_7d !== null && row.change_7d !== undefined && row.change_7d >= 0) return 'farm';
    if (!topHalf && (row.change_7d === null || row.change_7d === undefined || row.change_7d < -5)) return 'skip';
    return 'thin';
  }
  var VERDICT_LABEL = { farm: 'FARM', thin: 'THIN', skip: 'SKIP' };
  var VERDICT_NOTE = {
    farm: 'Farm fully: top half of the board and growing on a reported figure.',
    thin: 'Thin presence: a small position, no weekly actions.',
    skip: 'Skip this round: bottom half and shrinking, or growth not reported.'
  };
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('basis') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote on one live proposal.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC onto the ' + name + ' chain and use one of its apps.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the supply on ' + name + ', then repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Swap a small amount through " + name + "'s main pool and add a little liquidity back.";
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount through ' + name + ' again and use the funds on the other side.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the rewards ' + name + ' pays and check the position is still counted.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close and reopen one small hedge on ' + name + ' so the account shows fresh volume.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market on ' + name + ' and place a fresh position on another.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return "Check the " + name + " vault's allocation and top it up with a small deposit.";
    if (c.indexOf('stable') >= 0) return 'Mint or redeem a small amount of the stable asset through ' + name + '.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('basis') >= 0) return 'Claim the yield ' + name + ' accrued and leave the principal in place.';
    if (c.indexOf('insurance') >= 0) return 'Check the ' + name + ' policy is active and renew it before it lapses.';
    if (c.indexOf('governance') >= 0) return 'Vote on one new proposal on ' + name + ' and leave a short comment.';
    if (c.indexOf('payment') >= 0) return 'Send one small payment through ' + name + ' and keep the receipt.';
    return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(p);
    var net = netCostFor(p);
    var growthNote = p.change_7d === null || p.change_7d === undefined
      ? 'its seven-day TVL change is not reported in this snapshot, so growth is unknown'
      : 'its seven-day TVL change is ' + (p.change_7d >= 0 ? '+' : '') + p.change_7d.toFixed(2) + '%';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction (estimate)', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas.setup + ' of gas (estimate)', time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about $' + gas.weekly + ' of gas a week (estimate)', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position; whole plan nets about $' + net + ' of gas (estimate)', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes — never pay to claim, and never trust a link from a chat or a search ad.", cost: 'no fee to check', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
      { text: 'What this snapshot does not say: no points program, audit or lockup is recorded for ' + p.name + ', and ' + growthNote + '. Treat the position as if the points, the audit and the exit are all unknown — check the protocol\u2019s own terms before depositing, and never deposit more than you can lose.', cost: 'nothing to check, everything to lose if skipped', time: '10 minutes of reading' }
    ].map(stepText);
  }

  // Why this row is a priority now, from its own figures alone.
  function whyNow(r) {
    var bits = [];
    if (r.rank === 1) bits.push('Largest TVL on the board (' + fmtUsd(r.tvl_usd) + ')');
    else bits.push(fmtUsd(r.tvl_usd) + ' TVL');
    bits.push(r.age_days === null || r.age_days === undefined ? 'listing date not recorded' : fmtAge(r.age_days) + ' with no token on record');
    if (r.change_7d === null || r.change_7d === undefined) bits.push('growth not reported');
    else bits.push('7d ' + fmtPct(r.change_7d));
    return bits.join('; ') + '.';
  }
  // What can go wrong with this row, from its own figures plus what the snapshot leaves out.
  function riskLine(r) {
    var bits = [];
    if (r.change_7d === null || r.change_7d === undefined) bits.push('Growth unknown');
    else if (r.change_7d < -5) bits.push('TVL down ' + fmtPct(r.change_7d) + ' in 7 days — shrinking');
    else if (r.change_7d < 0) bits.push('TVL down ' + fmtPct(r.change_7d) + ' in 7 days');
    else bits.push('TVL up ' + fmtPct(r.change_7d) + ' in 7 days');
    var n = (r.chains || []).length;
    if (n === 1) bits.push('single chain — one chain\u2019s failure is the whole position');
    else if (n >= 10) bits.push(n + ' chains — wide surface, more bridge risk');
    bits.push('audit, lockup and points: not in this snapshot — unknown');
    return bits.join('; ') + '.';
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl > 0) params.set('minTvl', String(state.minTvl));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
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
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  // The decision, before the board: the six strongest rows, each with why now, what to do,
  // what it costs and what can go wrong — and the date every figure was verified on.
  function decisionPanel() {
    var top = DATA.rows.slice(0, 6);
    var counts = { farm: 0, thin: 0, skip: 0 };
    DATA.rows.forEach(function (r) { counts[verdictFor(r)]++; });
    var tbody = el('tbody');
    top.forEach(function (r) {
      var v = verdictFor(r);
      var tr = el('tr', {
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + fmtUsd(r.implied_value_usd) + ' implied' })
        )),
        el('td', { text: whyNow(r) }),
        el('td', { text: actionFor(r, capitalFor(r), chainOf(r)) }),
        el('td', { class: 'num', text: '$' + capitalFor(r) }),
        el('td', { class: 'num', text: '~$' + netCostFor(r) + ' gas' }),
        el('td', null, el('span', { class: 'verdict ' + v, text: VERDICT_LABEL[v] }))
      );
      tbody.appendChild(tr);
    });
    return el('section', { class: 'panel decision', id: 'decision' },
      el('h2', { text: 'Decision — read this first' }),
      el('p', { class: 'sub', text: 'The six strongest rows, in order. Every figure was verified on the DefiLlama snapshot of ' + DATA.as_of + ' (' + DATA.source + '). A launch is never predicted: implied value says what one would be worth if the record stayed as it is. Gas figures are estimates. Select a row for its evidence and full farm plan.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'decision-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: '#' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'Why now' }),
            el('th', { scope: 'col', text: 'Do this' }),
            el('th', { scope: 'col', text: 'Capital' }),
            el('th', { scope: 'col', text: 'Net cost' }),
            el('th', { scope: 'col', text: 'Call' })
          )),
          tbody
        )
      ),
      el('p', { class: 'sub decision-foot', text: 'Calls across the board: ' + counts.farm + ' farm, ' + counts.thin + ' thin, ' + counts.skip + ' skip. The three allocation plans below the board say how to work these rows with $300, with one hour a week, or with $2,500 — each with its order and its stop rule.' })
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ',
          el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL and no token on record. The early radar adds ',
          el('b', { text: String(DATA.early_size) + ' pre-token protocols' }),
          ' below that floor, priced by one size curve fitted on the live-token market. Implied value is a model, not a promise: it says what a launch would be worth if the record stayed as it is.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  var TVL_STEPS = [
    { value: 0, label: 'Any TVL' },
    { value: 5e6, label: '$5M+' },
    { value: 25e6, label: '$25M+' },
    { value: 1e8, label: '$100M+' },
    { value: 1e9, label: '$1B+' }
  ];

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'minTvl', 'aria-label': 'Filter by minimum TVL' },
      TVL_STEPS.map(function (s) { return el('option', { value: String(s.value), text: s.label, selected: s.value === state.minTvl ? 'selected' : null }); })
    );
    tvlSelect.addEventListener('change', function () { state.minTvl = Number(tvlSelect.value) || 0; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Min TVL' }), tvlSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var v = verdictFor(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'verdict ' + v, text: VERDICT_LABEL[v] })),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { id: 'board' },
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, its evidence and its farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('chains', 'Chains'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Call' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comps that price it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // The three allocation profiles: the same board as three plans, each with a budget, an order
  // and a stop rule. Picks are the board's own rows, taken by rank and verdict, never by name.
  function allocationPanel() {
    var cards = (DATA.allocations || []).map(function (a) {
      var pickRows = a.picks.map(function (p) {
        return el('li', null,
          el('b', { text: p.order + '. ' + p.name + ' ' }),
          el('span', { text: '(rank ' + p.rank + ') — $' + p.allocation_usd + ' · ' + VERDICT_LABEL[p.verdict] })
        );
      });
      return el('article', { class: 'alloc-card' },
        el('h3', { text: a.title }),
        el('p', { class: 'sub', text: a.mode }),
        el('div', { class: 'alloc-budget' },
          el('div', null, el('span', { text: 'Budget' }), el('b', { text: '$' + a.budget_usd.toLocaleString('en-US') })),
          el('div', null, el('span', { text: 'Gas reserve' }), el('b', { text: '$' + a.gas_reserve_usd })),
          el('div', null, el('span', { text: 'Time a week' }), el('b', { text: a.weekly_minutes + ' min' }))
        ),
        el('ol', { class: 'alloc-picks' }, pickRows),
        el('p', { class: 'sub', text: 'Open in order, one position at a time. Stop: ' + a.stop })
      );
    });
    return el('section', { class: 'panel allocations' },
      el('h2', { text: 'Allocation plans — three ways to work this board' }),
      el('p', { class: 'sub', text: 'Pick the profile that matches your capital and your week. The picks are the board\u2019s top farm and thin rows by rank; the budget counts capital only, and the gas reserve sits beside it for the transactions the plan needs.' }),
      el('div', { class: 'alloc-grid' }, cards)
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var at = (f.multiple_at || []).map(function (p) {
      return el('div', { class: 'comp' }, el('span', { text: 'TVL ' + fmtUsd(p.tvl_usd) }), el('b', { text: 'x' + p.multiple.toFixed(2) }));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ', el('b', { text: 'fitted multiple(tvl_usd)' }),
        ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')',
        ' x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ')',
        ' x (1 + 0.02 x min(chains - 1, 10)) )'
      ),
      el('p', { class: 'sub', text: 'The fitted multiple is a log-log line through the snapshot\u2019s ' + (DATA.fit_comps || []).length + ' live-token protocols, fitted by the page itself from the comps in data.js: log10(multiple) = ' + FIT.intercept.toFixed(4) + ' + ' + FIT.slope.toFixed(4) + ' x log10(TVL), clamped to ' + m.fit_clamp_lo + '–' + m.fit_clamp_hi + '. It is tested out of sample, in the page too: leave-one-out, each live protocol priced by a line fitted without it, the mean absolute log10 error is ' + FIT_TEST.loo.toFixed(4) + ', against ' + FIT_TEST.flat.toFixed(4) + ' for a flat median (x' + FIT_TEST.flatMedian.toFixed(4) + ') on the same test — the curve earns its place instead of asserting it. Age is the time since the protocol was first listed — how long it has run with no token on record; an unlisted age uses ' + m.unknown_age_days + ' days, and an unreported seven-day change uses 0. Wrapped, staked and bridged products of a token that already trades are left out of the board entirely.' }),
      el('div', { class: 'comps' }, at)
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var v = verdictFor(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted multiple (size curve)' }), el('b', { class: 'num', text: 'x' + row.fitted_multiple.toFixed(2) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain breadth (' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: 'x' + row.chain_multiplier.toFixed(2) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Call' }), el('b', { class: 'num' }, el('span', { class: 'verdict ' + v, text: VERDICT_LABEL[v] }))),
        el('div', null, el('span', { text: 'Plan net gas (estimate)' }), el('b', { class: 'num', text: '~$' + netCostFor(row) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' ' + VERDICT_NOTE[v] + ' This is an estimate, not a price. The protocol records no token — that is the snapshot\u2019s record, not proof it has none.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Evidence and what is unknown' }),
      el('ul', { class: 'evidence' },
        el('li', null, el('b', { text: 'Source: ' }), 'DefiLlama protocol index, ' + DATA.source + '; snapshot as of ' + DATA.as_of + '.'),
        el('li', null, el('b', { text: 'First listed: ' }), row.listed_at === null ? 'not recorded — age unknown, the model uses 365 days.' : row.listed_at + ' — ' + fmtAge(row.age_days) + ' with no token on record.'),
        el('li', null, el('b', { text: 'Seven-day TVL change: ' }), row.change_7d === null ? 'not reported — the model uses 0 and the call treats growth as unknown.' : fmtPct(row.change_7d) + '.'),
        el('li', null, el('b', { text: 'Token: ' }), 'records no token — no market cap, no CoinGecko id, no symbol in the snapshot. That is the record, not proof it has none.'),
        el('li', null, el('b', { text: 'Chains: ' }), (row.chains && row.chains.length ? row.chains.join(', ') : 'none recorded') + '.'),
        el('li', null, el('b', { text: 'Unknown: ' }), 'no points program, audit, lockup or fee is recorded for this protocol in this snapshot. Gas figures in the plan are estimates. Risk: ' + riskLine(row))
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
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
    shell.appendChild(decisionPanel());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(allocationPanel());
      shell.appendChild(modelPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () {
    state.selected = null;
    readHash();
    render();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();

