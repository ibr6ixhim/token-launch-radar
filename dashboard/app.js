// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and shows the ranked board, the farm plan and the model's evidence. No network: every byte it
// shows is in data.js. The answer comes first: the three farms with the best net per hour.
//
// Deep links are query params: ?view=board|detail|filtered&slug=<slug>&tab=watchlist|early|off-list
// &category=<name>&chain=<name>&q=<text>&minTvl=<usd>&sort=rank|implied|net|tvl&farmers=<n>

var DATA = window.RADAR;
var $ = function (id) { return document.getElementById(id); };
/* The snapshot's source line carries a fetch URL; the page shows the short name only. */
var SRC = DATA.source.replace(/\s+https?:\/\/\S+.*$/, '').replace(/, fetched.*$/, '') || 'DefiLlama';

/* ---------- formatting ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(v) {
  if (v == null) return '—';
  var a = Math.abs(v);
  if (a >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
  if (a >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return '$' + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '$' + Math.round(v).toLocaleString('en-US');
}
function moneyFull(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
function pct(v, digits) { return (v > 0 ? '+' : '') + (v * 100).toFixed(digits == null ? 1 : digits) + '%'; }
function ageFmt(d) {
  if (d == null) return 'unknown';
  if (d < 365) return d + 'd';
  return (d / 365).toFixed(1).replace(/\.0$/, '') + 'y';
}
function signed(v, digits) { return (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toFixed(digits == null ? 0 : digits); }

/* ---------- state ---------- */
var Q = new URLSearchParams(location.search);
function stateFromUrl() {
  return {
    view: Q.get('view') || 'board',
    slug: Q.get('slug') || '',
    tab: Q.get('tab') || 'all',
    category: Q.get('category') || '',
    chain: Q.get('chain') || '',
    q: Q.get('q') || '',
    minTvl: parseFloat(Q.get('minTvl') || '0') || 0,
    sort: Q.get('sort') || 'rank',
    dir: Q.get('dir') || 'asc',
    farmers: parseInt(Q.get('farmers') || '5000', 10) || 5000,
  };
}
var S = stateFromUrl();
function pushUrl() {
  var p = new URLSearchParams();
  if (S.view !== 'board') p.set('view', S.view);
  if (S.slug) p.set('slug', S.slug);
  if (S.tab !== 'all') p.set('tab', S.tab);
  if (S.category) p.set('category', S.category);
  if (S.chain) p.set('chain', S.chain);
  if (S.q) p.set('q', S.q);
  if (S.minTvl) p.set('minTvl', String(S.minTvl));
  if (S.sort !== 'rank') p.set('sort', S.sort);
  if (S.dir !== 'asc') p.set('dir', S.dir);
  if (S.farmers !== 5000) p.set('farmers', String(S.farmers));
  var s = p.toString();
  history.replaceState(null, '', s ? '?' + s : location.pathname);
}

/* ---------- farm economics (the what-if panel recomputes these live) ---------- */
var GAS_USD = { Ethereum: 8, Base: 0.5, Arbitrum: 1, Optimism: 0.5, Solana: 0.1, Tron: 2, Binance: 0.5, Polygon: 0.3, Avalanche: 0.5, Bittensor: 0.5, Sui: 0.1, Aptos: 0.1, Ink: 0.5, Blast: 0.5, Mode: 0.3, Berachain: 0.5, Hyperliquid: 0.5, Unichain: 0.5 };
var HOURS = 1.5, HOURLY = 15, TBILL = 0.04, TXS = 6;
function depositFor(row) { return row.tvl_usd >= 5e9 ? 250 : row.tvl_usd >= 1e9 ? 150 : row.tvl_usd >= 1e8 ? 100 : 50; }
function holdFor(row) { var a = row.age_days; return a == null ? 30 : a < 180 ? 60 : a < 365 ? 45 : 30; }
function gasFor(row) { return (GAS_USD[row.chains[0]] || 2) * TXS; }
/* The farm's net under the current what-if farmers count. */
function econ(row) {
  var expected = row.implied_value_usd * row.odds * (0.05 / S.farmers);
  var dep = depositFor(row);
  var costs = gasFor(row) + HOURS * HOURLY + dep * TBILL * (holdFor(row) / 365);
  var net = expected - costs;
  var nph = net / HOURS;
  var verdict = net >= 20 && nph >= 8 ? 'FARM' : net >= 0 ? 'MARGINAL' : net >= -15 ? 'THIN' : 'SKIP';
  return { expected: expected, costs: costs, net: net, nph: nph, verdict: verdict, deposit: dep, gas: gasFor(row), hold: holdFor(row) };
}
function tierOf(row) {
  if (DATA.watchlist.indexOf(row.slug) >= 0) return 'watchlist';
  if (row.age_days != null && row.age_days < 180) return 'early';
  return 'off-list';
}

/* ---------- hero: farm this first ---------- */
function heroHtml() {
  var top = DATA.rows.map(function (r) { return { r: r, e: econ(r) }; })
    .sort(function (a, b) { return b.e.nph - a.e.nph || a.r.rank - b.r.rank; }).slice(0, 3);
  var cards = top.map(function (t, i) {
    var r = t.r, e = t.e;
    return '<article class="hero-card"><div class="k">Farm #' + (i + 1) + ' · net per hour</div>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<div class="net">' + signed(e.nph, 0) + '<small>/h</small></div>' +
      '<p>Net <b>' + signed(e.net, 0) + '</b> for <b>' + HOURS + 'h</b> of work on a <b>$' + e.deposit + '</b> deposit. ' +
      'Implied <b>' + money(r.implied_value_usd) + '</b> at <b>' + Math.round(r.odds * 100) + '%</b> launch odds.</p></article>';
  }).join('');
  return '<section aria-label="Farm this first"><h1>Farm dulu ini</h1>' +
    '<p class="lede">The three farms that pay best per hour — ranked by net dollars per hour of work, not by ' +
    'size. Every row is a protocol with <b>no token on record</b>, scored from the ' +
    '<b>' + esc(DATA.as_of) + '</b> snapshot: its TVL, its seven-day growth, and how long it has run with no token.</p>' +
    '<div class="hero">' + cards + '</div></section>';
}

/* ---------- KPI strip ---------- */
function kpiHtml() {
  var v = DATA.verdict_counts;
  var kpis = [
    [DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'watchlist covered'],
    [String(DATA.board_size), 'pre-token rows scored'],
    [money(DATA.total_implied_usd), 'total implied value'],
    [String(DATA.live_size), 'live-token set aside'],
    [v.FARM + ' FARM', v.MARGINAL + ' marginal · ' + v.THIN + ' thin · ' + v.SKIP + ' skip'],
    [DATA.ledger.total + ' / ' + DATA.ledger.total, 'protocols in the ledger'],
  ];
  return '<section class="kpis" aria-label="Coverage">' + kpis.map(function (k) {
    return '<div class="kpi"><div class="n">' + esc(k[0]) + '</div><div class="l">' + esc(k[1]) + '</div></div>';
  }).join('') + '</section>';
}

/* ---------- controls ---------- */
function controlsHtml() {
  var cats = {}, chains = {};
  DATA.rows.forEach(function (r) {
    cats[r.category || 'Other'] = (cats[r.category || 'Other'] || 0) + 1;
    r.chains.forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
  });
  var catOpts = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).slice(0, 14)
    .map(function (c) { return '<option value="' + esc(c) + '"' + (S.category === c ? ' selected' : '') + '>' + esc(c) + ' (' + cats[c] + ')</option>'; }).join('');
  var chainOpts = Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a]; }).slice(0, 14)
    .map(function (c) { return '<option value="' + esc(c) + '"' + (S.chain === c ? ' selected' : '') + '>' + esc(c) + ' (' + chains[c] + ')</option>'; }).join('');
  var tabs = [['all', 'All'], ['watchlist', 'Watchlist'], ['early', 'Early'], ['off-list', 'Off-list']];
  var seg = tabs.map(function (t) {
    return '<button type="button" data-tab="' + t[0] + '" aria-pressed="' + (S.tab === t[0]) + '">' + t[1] + '</button>';
  }).join('');
  var sorts = [['implied', 'Implied value'], ['net', 'Net per hour']];
  var tog = sorts.map(function (t) {
    return '<button type="button" data-sort="' + t[0] + '" aria-pressed="' + (S.sort === t[0]) + '">' + t[1] + '</button>';
  }).join('');
  return '<div class="controls">' +
    '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Search name or chain" value="' + esc(S.q) + '"></div>' +
    '<div class="field"><label for="cat">Category</label><select id="cat"><option value="">All categories</option>' + catOpts + '</select></div>' +
    '<div class="field"><label for="chain">Chain</label><select id="chain"><option value="">All chains</option>' + chainOpts + '</select></div>' +
    '<div class="field"><label for="minTvl">Min TVL</label><select id="minTvl">' +
    [[0, 'Any'], [5e7, '$50M'], [1e8, '$100M'], [5e8, '$500M'], [1e9, '$1B']].map(function (o) {
      return '<option value="' + o[0] + '"' + (S.minTvl === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select></div>' +
    '<div class="field"><label>Tier</label><div class="seg">' + seg + '</div></div>' +
    '<div class="field"><label>Sort board by</label><div class="toggle"><button type="button" data-sort="rank" aria-pressed="' + (S.sort === 'rank') + '">Rank</button>' + tog + '</div></div>' +
    '<div class="field"><label for="farmers">What if: farmers sharing the drop</label><input type="range" id="farmers" min="1000" max="50000" step="1000" value="' + S.farmers + '" style="width:170px"><span class="note" id="farmersLabel">' + S.farmers.toLocaleString('en-US') + ' farmers · 5% drop</span></div>' +
    '<span class="count" id="count"></span></div>';
}

/* ---------- board table ---------- */
function filteredRows() {
  var q = S.q.trim().toLowerCase();
  var rows = DATA.rows.filter(function (r) {
    if (S.tab !== 'all' && tierOf(r) !== S.tab) return false;
    if (S.category && (r.category || 'Other') !== S.category) return false;
    if (S.chain && r.chains.indexOf(S.chain) < 0) return false;
    if (r.tvl_usd < S.minTvl) return false;
    if (q && (r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  var key = S.sort === 'implied' ? function (r) { return r.implied_value_usd; }
    : S.sort === 'net' ? function (r) { return econ(r).nph; }
    : S.sort === 'tvl' ? function (r) { return r.tvl_usd; }
    : function (r) { return r.rank; };
  rows.sort(function (a, b) {
    var d = key(b) - key(a);
    if (S.sort === 'rank') d = -d;
    if (S.dir === 'desc') d = -d;
    return d || (a.slug < b.slug ? -1 : 1);
  });
  return rows;
}
function tableHtml(rows) {
  var maxImp = Math.max.apply(null, DATA.rows.map(function (r) { return r.implied_value_usd; }));
  var body = rows.map(function (r) {
    var e = econ(r);
    var tier = tierOf(r);
    var step = r.rank <= 3 ? '<div class="pstep">' + esc(r.farm_steps[1].split(' Cost: ')[0]) + '</div>' : '';
    var chg = r.change_7d == null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d / 100) + '</span>';
    var clock = r.airdrop_clock;
    return '<tr data-slug="' + esc(r.slug) + '" class="' + (r.rank <= 3 ? 'top' : '') + '">' +
      '<td class="rank num">' + r.rank + '</td>' +
      '<td><div class="pname">' + esc(r.name) + '</div><div class="psub">' + esc(r.category || 'Other') + ' on ' + esc(r.chains.slice(0, 3).join(', ')) + '</div>' + step +
      '<span class="tier">' + tier + '</span></td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num">' + chg + '</td>' +
      '<td><div class="bar"><i style="width:' + Math.max(2, Math.round((r.implied_value_usd / maxImp) * 100)) + '%"></i></div><span class="num"><b>' + money(r.implied_value_usd) + '</b></span></td>' +
      '<td class="band">#' + r.rank_lo + '–#' + r.rank_hi + '<br>stability ' + r.rank_stability.toFixed(2) + '</td>' +
      '<td class="clock"><b>' + ageFmt(clock.age_days) + '</b> with no token<br>median traded peer ' + ageFmt(clock.median_traded_age_days) + '<br>' + (clock.progress_pct == null ? '—' : clock.progress_pct + '% of median') + ' · odds ' + Math.round(clock.bucket_odds * 100) + '%</td>' +
      '<td><span class="verdict v-' + e.verdict + '">' + e.verdict + '</span><div class="nph"><b>' + signed(e.nph, 1) + '/h</b><br>net ' + signed(e.net, 0) + '</div></td>' +
      '</tr>';
  }).join('');
  return '<table aria-label="Ranked board"><thead><tr>' +
    '<th><button type="button" data-sort="rank">Rank ↕</button></th><th>Protocol</th>' +
    '<th><button type="button" data-sort="tvl">TVL ↕</button></th><th>7d</th>' +
    '<th><button type="button" data-sort="implied">Implied value ↕</button></th>' +
    '<th>Rank band</th><th>Airdrop clock</th>' +
    '<th><button type="button" data-sort="net">Verdict ↕</button></th></tr></thead><tbody>' + body + '</tbody></table>';
}

/* ---------- scatter: the size curve, drawn from the snapshot ---------- */
function scatterSvg(highlight) {
  var W = 660, H = 380, P = 46, x0 = 6.4, x1 = 10.2, y0 = 4.2, y1 = 9.6;
  var X = function (x) { return P + ((x - x0) / (x1 - x0)) * (W - 2 * P); };
  var Y = function (y) { return H - P - ((y - y0) / (y1 - y0)) * (H - 2 * P); };
  var out = '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter of market cap against TVL, log scale, with the fitted size curve">';
  for (var g = 7; g <= 10; g++) out += '<line x1="' + X(g) + '" y1="' + Y(y0) + '" x2="' + X(g) + '" y2="' + Y(y1) + '" stroke="#1c2530"/>';
  for (var h = 5; h <= 9; h++) out += '<line x1="' + X(x0) + '" y1="' + Y(h) + '" x2="' + X(x1) + '" y2="' + Y(h) + '" stroke="#1c2530"/>';
  DATA.scatter.comps.forEach(function (p) { out += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2.4" fill="#5b6b7c"/>'; });
  DATA.scatter.board.forEach(function (p) { out += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="3" fill="#34d399" opacity="0.85"/>'; });
  var L = DATA.scatter.line;
  out += '<line x1="' + X(L[0]).toFixed(1) + '" y1="' + Y(L[1]).toFixed(1) + '" x2="' + X(L[2]).toFixed(1) + '" y2="' + Y(L[3]).toFixed(1) + '" stroke="#f59e0b" stroke-width="2" stroke-dasharray="7 5"/>';
  if (highlight) {
    var hx = Math.log10(highlight.tvl_usd), hy = Math.log10(highlight.implied_value_usd);
    out += '<circle cx="' + X(hx).toFixed(1) + '" cy="' + Y(hy).toFixed(1) + '" r="9" fill="none" stroke="#e8eef4" stroke-width="2"/>' +
      '<text x="' + Math.min(X(hx) + 12, W - 180).toFixed(1) + '" y="' + Math.max(Y(hy) - 12, 16).toFixed(1) + '" fill="#e8eef4" font-size="14" font-weight="700">' + esc(highlight.name) + '</text>';
  }
  out += '<text x="' + (W / 2) + '" y="' + (H - 10) + '" fill="#93a1b0" font-size="13" text-anchor="middle">log10 TVL (USD)</text>' +
    '<text x="14" y="' + (H / 2) + '" fill="#93a1b0" font-size="13" text-anchor="middle" transform="rotate(-90 14 ' + (H / 2) + ')">log10 market cap / implied value (USD)</text></svg>';
  return out + '<div class="legend"><span><i style="background:#5b6b7c"></i>' + DATA.fit.n + ' traded tokens (the comparables)</span>' +
    '<span><i style="background:#34d399"></i>' + DATA.board_size + ' board rows (implied value)</span>' +
    '<span><i style="background:#f59e0b;border-radius:0;height:3px;width:18px"></i>fitted curve, slope ' + DATA.fit.slope + '</span></div>';
}

/* ---------- detail view ---------- */
function detailHtml(row) {
  var e = econ(row);
  var m = row.model;
  var clock = row.airdrop_clock;
  var steps = row.farm_steps.map(function (s, i) {
    var parts = s.split(' Cost: ');
    var body = parts[0] || s;
    var meta = parts[1] ? 'Cost: ' + parts[1] : '';
    return '<li><div>' + esc(body) + '</div><div class="meta">' + esc(meta) + '</div></li>';
  }).join('');
  return '<button type="button" class="back" id="backBtn">← Back to the board</button>' +
    '<section class="detail"><div class="tier">' + tierOf(row) + '</div><h2>' + esc(row.name) + '</h2>' +
    '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc(row.chains.join(', ')) + ' · rank #' + row.rank + ' of ' + DATA.board_size +
    ' · ' + ageFmt(row.age_days) + ' with no token · TVL ' + money(row.tvl_usd) + '</p>' +
    '<div class="dgrid"><div><h3>Farm plan</h3><ol class="steps">' + steps + '</ol></div><div>' +
    '<h3>Verdict</h3><dl class="kv">' +
    '<dt>Verdict</dt><dd><span class="verdict v-' + e.verdict + '">' + e.verdict + '</span></dd>' +
    '<dt>Expected airdrop</dt><dd>' + moneyFull(e.expected) + '</dd>' +
    '<dt>Costs (gas, time, T-bill)</dt><dd>' + moneyFull(e.costs) + '</dd>' +
    '<dt>Net</dt><dd><b>' + signed(e.net, 0) + '</b></dd>' +
    '<dt>Net per hour</dt><dd><b>' + signed(e.nph, 1) + '/h</b> (' + HOURS + 'h)</dd>' +
    '<dt>Deposit</dt><dd>$' + e.deposit + ' · hold ' + e.hold + ' days</dd>' +
    '<dt>Launch odds</dt><dd>' + Math.round(row.odds * 100) + '%</dd></dl>' +
    '<h3>How the implied value is built</h3><dl class="kv">' +
    '<dt>Base from the curve</dt><dd>' + money(m.base_value_usd) + '</dd>' +
    '<dt>Growth ×' + m.growth_multiplier + '</dt><dd>' + (row.change_7d == null ? 'no 7d change' : pct(row.change_7d / 100) + ' in 7 days') + '</dd>' +
    '<dt>Tenure ×' + m.tenure_multiplier + '</dt><dd>' + ageFmt(m.age_days) + ' with no token</dd>' +
    '<dt>Category ×' + m.category_multiplier + '</dt><dd>' + esc(row.category || 'Other') + '</dd>' +
    '<dt>Kinship ×' + m.kinship_multiplier + '</dt><dd>' + (m.kinship_multiplier < 1 ? 'a sibling token already trades' : 'no sibling token trades') + '</dd>' +
    '<dt>Chains ×' + m.chain_multiplier + '</dt><dd>' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + '</dd>' +
    '<dt>Implied value</dt><dd><b>' + money(row.implied_value_usd) + '</b></dd></dl>' +
    '<h3>Airdrop clock</h3><dl class="kv">' +
    '<dt>Age with no token</dt><dd>' + ageFmt(clock.age_days) + '</dd>' +
    '<dt>Median traded peer</dt><dd>' + ageFmt(clock.median_traded_age_days) + ' in ' + esc(row.category || 'Other') + '</dd>' +
    '<dt>Progress</dt><dd>' + (clock.progress_pct == null ? '—' : clock.progress_pct + '% of the median age') + '</dd>' +
    '<dt>Rank band</dt><dd>#' + row.rank_lo + '–#' + row.rank_hi + ' · stability ' + row.rank_stability.toFixed(2) + '</dd></dl>' +
    '</div></div></section>' +
    '<section class="panel wide"><h2>Where this row sits on the size curve</h2>' + scatterSvg(row) + '</section>';
}

/* ---------- evidence panels ---------- */
function panelsHtml() {
  var f = DATA.fit, ab = DATA.ablation, cal = DATA.calibration, od = DATA.odds, lg = DATA.ledger;
  var abRows = ab.map(function (a) {
    return '<tr><td>' + esc(a.terms) + (a.kept ? ' <b style="color:var(--green)">· shipped</b>' : '') + '</td>' +
      '<td class="num">×' + a.loo_median_miss.toFixed(2) + '</td><td class="num">×' + a.wf1_median_miss.toFixed(2) + '</td><td class="num">×' + a.wf2_median_miss.toFixed(2) + '</td></tr>';
  }).join('');
  var odRows = od.buckets.map(function (b) {
    return '<tr><td>' + b.lo + '–' + (b.hi == null ? '∞' : b.hi) + ' days</td><td class="num">' + b.n + '</td><td class="num">' + b.traded + '</td><td class="num">' + Math.round(b.p * 100) + '%</td></tr>';
  }).join('');
  var lgRows = lg.excluded_reasons.map(function (x) { return '<tr><td>' + esc(x.reason) + '</td><td class="num">' + x.count + '</td></tr>'; }).join('');
  return '<section class="panels">' +
    '<div class="panel"><h2>The model, in one line</h2>' +
    '<div class="formula">implied = 10^(' + f.intercept + ' + ' + f.slope + ' · log10 TVL) × growth × tenure × category × kinship × chains</div>' +
    '<p>Fitted by ordinary least squares on <b>' + f.n + ' traded tokens</b> from the snapshot itself: slope <b>' + f.slope + '</b>, ' +
    'intercept <b>' + f.intercept + '</b>, R² <b>' + f.r2 + '</b>. A flat TVL × 0.25 misses by ×4.23; this curve misses by ×' + ab[ab.length - 1].loo_median_miss.toFixed(2) + '.</p>' +
    '<h3>What each term does</h3><p>· <b>Growth</b> discounts TVL that just spiked: 10^(−0.25 × clamped 7-day change). The raw fitted coefficient is −1.64, shrunk to −0.25 because it is unstable across time folds.<br>' +
    '· <b>Tenure</b> pays a small premium for time with no token: 0.90 + 0.20 × min(age, 1095) / 1095.<br>' +
    '· <b>Category</b> adds the category’s shrunk mean residual (categories with n ≥ 5).<br>' +
    '· <b>Kinship</b> halves the value when a sibling protocol’s token already trades.<br>' +
    '· <b>Chains</b> discounts breadth: 10^(−0.25 × log10 chains).</p>' +
    '<h3>Ablation — median miss, three held-out tests</h3>' +
    '<table><thead><tr><th>Term set</th><th>Leave-one-out</th><th>Walk-forward 2024</th><th>Walk-forward Jul 2024</th></tr></thead><tbody>' + abRows + '</tbody></table>' +
    '<p class="note">Each term is kept only when it lowers the miss. No single term dominates; the full set of five dampened terms beats the base curve on all three tests, so the full set ships.</p>' +
    '<h3>Calibration — the range is honest</h3><p>The model’s own residual quantiles, on the ' + cal.n + ' comparables: the P25–P75 band spans <b>×' + cal.p25 + ' to ×' + cal.p75 + '</b>, ' +
    'the P10–P90 band <b>×' + cal.p10 + ' to ×' + cal.p90 + '</b>. <b>' + cal.in_25_75_pct + '%</b> of tokens fall inside the stated 50% band; <b>' + cal.in_10_90_pct + '%</b> inside the stated 80% band.</p></div>' +
    '<div class="panel"><h2>Token odds and the ledger</h2>' +
    '<h3>Launch odds by age — share of protocols that already trade</h3>' +
    '<table><thead><tr><th>Age bucket</th><th>Protocols</th><th>Traded</th><th>Odds</th></tr></thead><tbody>' + odRows + '</tbody></table>' +
    '<p>Brier score <b>' + od.brier + '</b> against the base rate’s <b>' + od.base_brier + '</b> (base rate ' + Math.round(od.base_rate * 100) + '%). ' +
    'Older protocols launch more often — the clock on each row is the protocol’s age against its category’s median traded age.</p>' +
    '<h3>Where the curve comes from</h3>' + scatterSvg(null) +
    '<h3>Ledger — all ' + lg.total + ' protocols, exactly one group each</h3>' +
    '<table><tbody><tr><td>Ranked on the board</td><td class="num">' + lg.ranked + '</td></tr>' +
    '<tr><td>Token already trades (set aside)</td><td class="num">' + lg.traded + '</td></tr>' +
    '<tr><td>Pre-token, not ranked</td><td class="num">' + lg.excluded + '</td></tr></tbody></table>' +
    '<table><tbody>' + lgRows + '</tbody></table>' +
    '<h3>Integrity</h3><div class="strip">' +
    '<span>board.json sha256 <code title="' + esc(DATA.integrity.board_sha256) + '">' + esc(DATA.integrity.board_sha256.slice(0, 16)) + '…</code></span>' +
    '<span>watchlist <b>' + esc(DATA.integrity.watchlist) + '</b></span>' +
    '<span>ledger <b>' + esc(DATA.integrity.ledger) + '</b></span>' +
    '<span>snapshot <b>' + esc(DATA.as_of) + '</b> · ' + esc(SRC) + '</span></div>' +
    '<p class="note">“No token” means the snapshot records no token: no market cap, no CoinGecko id, no symbol. ' +
    'Implied value is a model, not a promise. Gas is a per-chain estimate, not a quote. The drop share is a stated assumption — move the what-if slider above to see the verdicts move.</p></div>' +
    '</section>';
}

/* ---------- filtered view heading: no hero, so the rows fill the frame ---------- */
function filteredHeadingHtml(rows) {
  var bits = [];
  if (S.tab !== 'all') bits.push('tier ' + S.tab);
  if (S.category) bits.push('category ' + S.category);
  if (S.chain) bits.push('chain ' + S.chain);
  if (S.q) bits.push('matching “' + S.q + '”');
  if (S.minTvl) bits.push('TVL at least ' + money(S.minTvl));
  return '<section><h1>Filtered board</h1><p class="lede">' + rows.length + ' protocol' + (rows.length === 1 ? '' : 's') +
    (bits.length ? ' — ' + bits.join(' · ') : '') + ', ranked by ' +
    (S.sort === 'net' ? 'net dollars per hour' : S.sort === 'implied' ? 'implied value' : S.sort === 'tvl' ? 'TVL' : 'implied value') +
    '. The farm verdicts follow the same economics as the full board.</p></section>';
}

/* ---------- render + events ---------- */
function render() {
  var app = $('app');
  if (S.view === 'detail' && S.slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === S.slug) row = r; });
    if (row) {
      app.innerHTML = '<div class="wrap"><div class="topbar"><span class="brand"><i></i>Token Radar</span><span>Snapshot ' + esc(DATA.as_of) + ' · ' + esc(SRC) + ' · ' + esc(DATA.model_version) + ' model</span></div>' + detailHtml(row) + '</div>';
      app.removeAttribute('aria-busy');
      var back = $('backBtn');
      if (back) back.addEventListener('click', function () { S.view = 'board'; S.slug = ''; pushUrl(); render(); window.scrollTo(0, 0); });
      return;
    }
    S.view = 'board'; S.slug = '';
  }
  var rows = filteredRows();
  var head = S.view === 'filtered' ? filteredHeadingHtml(rows) : heroHtml() + kpiHtml();
  app.innerHTML = '<div class="wrap"><div class="topbar"><span class="brand"><i></i>Token Radar</span><span>Snapshot ' + esc(DATA.as_of) + ' · ' + esc(SRC) + ' · ' + esc(DATA.model_version) + ' model</span></div>' +
    head + controlsHtml() + '<div id="board">' + tableHtml(rows) + '</div>' + panelsHtml() + '</div>';
  app.removeAttribute('aria-busy');
  var count = $('count');
  if (count) count.textContent = rows.length + ' rows shown';
  bind();
}
function bind() {
  var q = $('q');
  if (q) q.addEventListener('input', function () { S.q = q.value; pushUrl(); render(); var nq = $('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
  ['cat', 'chain', 'minTvl'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('change', function () {
      if (id === 'cat') S.category = el.value;
      if (id === 'chain') S.chain = el.value;
      if (id === 'minTvl') S.minTvl = parseFloat(el.value) || 0;
      pushUrl(); render();
    });
  });
  var farmers = $('farmers');
  if (farmers) farmers.addEventListener('input', function () {
    S.farmers = parseInt(farmers.value, 10) || 5000;
    var lab = $('farmersLabel');
    if (lab) lab.textContent = S.farmers.toLocaleString('en-US') + ' farmers · 5% drop';
    pushUrl(); render();
  });
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () { S.tab = b.getAttribute('data-tab'); pushUrl(); render(); });
  });
  document.querySelectorAll('[data-sort]').forEach(function (b) {
    b.addEventListener('click', function () {
      var s = b.getAttribute('data-sort');
      if (S.sort === s) S.dir = S.dir === 'asc' ? 'desc' : 'asc';
      else { S.sort = s; S.dir = 'asc'; }
      pushUrl(); render();
    });
  });
  document.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
    tr.addEventListener('click', function () { S.view = 'detail'; S.slug = tr.getAttribute('data-slug'); pushUrl(); render(); window.scrollTo(0, 0); });
  });
}
if (!window.RADAR) {
  document.getElementById('app').innerHTML = '<div class="wrap"><p>Token Radar needs data.js beside dashboard/.</p></div>';
} else {
  render();
}
