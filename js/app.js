/* CashFlow app — UI glue. Browser only. */
(function () {
  "use strict";
  var CF = window.CashFlow;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var state = {
    items: CF.storageGet("items", null),
    startBalance: CF.storageGet("startBalance", CF.SAMPLE_START_BALANCE),
    warnAt: CF.storageGet("warnAt", 1000),
    horizon: CF.storageGet("horizon", 13),
    scenarios: CF.storageGet("scenarios", []),
    activeScn: CF.storageGet("activeScn", ""),
    editingId: null,
    searchIn: "",
    searchOut: ""
  };
  if ([4, 13, 26].indexOf(+state.horizon) === -1) state.horizon = 13;
  if (!state.items) {
    state.items = CF.SAMPLE_INVOICES.concat(CF.SAMPLE_BILLS);
    CF.storageSet("items", state.items);
    CF.storageSet("startBalance", state.startBalance);
  }

  function save() {
    CF.storageSet("items", state.items);
    CF.storageSet("startBalance", state.startBalance);
    CF.storageSet("warnAt", state.warnAt);
    CF.storageSet("horizon", state.horizon);
    CF.storageSet("scenarios", state.scenarios);
    CF.storageSet("activeScn", state.activeScn);
  }

  function baseForecast() { return CF.forecast(state.items, state.startBalance, state.horizon, {}); }
  function scenarioForecasts() {
    return state.scenarios.map(function (sc) {
      return { scn: sc, fc: CF.forecast(state.items, state.startBalance, state.horizon, sc.shifts || {}) };
    });
  }
  function scnColor(i) { return SCN_COLORS[i % SCN_COLORS.length]; }

  // ---------- SVG chart ----------
  var SCN_COLORS = ["#8a6d1f", "#a03d2d", "#3d6b8e"];
  var SCN_DASH = ["7 5", "3 4", "11 4 3 4"];

  function chartSVG(fc, scnFcs) {
    scnFcs = scnFcs || [];
    var W = 860, H = 320, padL = 56, padB = 52, padT = 18;
    var cw = W - padL - 12, ch = H - padT - padB;
    var maxV = 1000, minV = 0;
    function swallow(f) {
      f.forEach(function (w) {
        maxV = Math.max(maxV, w.inflow, w.outflow, w.balance);
        minV = Math.min(minV, w.balance);
      });
    }
    swallow(fc);
    scnFcs.forEach(function (s) { swallow(s.fc); });
    var span = (maxV - minV) || 1;
    function y(v) { return padT + ch - ((v - minV) / span) * ch; }
    function x(i) { return padL + (i + 0.5) * (cw / fc.length); }
    var bw = Math.min(20, (cw / fc.length) / 3.6);

    var s = '<svg viewBox="0 0 ' + W + " " + H + '" class="chart" role="img" aria-label="' + fc.length + '-week cash flow chart">';
    // danger zone below zero
    s += '<rect x="' + padL + '" y="' + y(0).toFixed(1) + '" width="' + cw + '" height="' +
      (padT + ch - y(0)).toFixed(1) + '" class="dangerzone"/>';
    // gridlines
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var gv = Math.round((minV + span * f) / 500) * 500;
      var glabel = gv === 0 ? "0" : "$" + (gv / 1000) + "k";
      s += '<line x1="' + padL + '" y1="' + y(gv).toFixed(1) + '" x2="' + (W - 12) + '" y2="' + y(gv).toFixed(1) + '" class="grid"/>' +
        '<text x="' + (padL - 6) + '" y="' + (y(gv) + 4).toFixed(1) + '" class="axis" text-anchor="end">' + glabel + "</text>";
    });
    // bars: inflow / outflow (slim, behind the lines)
    fc.forEach(function (w, i) {
      var cx = x(i);
      var crit = w.balance < 0;
      if (crit) s += '<rect x="' + (cx - bw - 7).toFixed(1) + '" y="' + padT + '" width="' + (bw * 2 + 14).toFixed(1) + '" height="' + ch + '" class="shortband"/>';
      s += '<rect x="' + (cx - bw - 2).toFixed(1) + '" y="' + y(w.inflow).toFixed(1) + '" width="' + bw + '" height="' + Math.max(0, y(0) - y(w.inflow)).toFixed(1) + '" class="bar-in"/>';
      s += '<rect x="' + (cx + 2).toFixed(1) + '" y="' + y(w.outflow).toFixed(1) + '" width="' + bw + '" height="' + Math.max(0, y(0) - y(w.outflow)).toFixed(1) + '" class="bar-out"/>';
    });
    // base balance: area fill + thick line (NOT clamped — dips into the danger zone)
    function lineD(f) {
      return f.map(function (w, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(w.balance).toFixed(1); }).join(" ");
    }
    var baseD = lineD(fc);
    s += '<path d="' + baseD + " L" + x(fc.length - 1).toFixed(1) + "," + y(0).toFixed(1) + " L" + x(0).toFixed(1) + "," + y(0).toFixed(1) + ' Z" class="bal-area" fill="none"/>';
    // scenario lines (under the base line)
    scnFcs.forEach(function (sf, si) {
      s += '<path d="' + lineD(sf.fc) + '" class="scn-line" fill="none" stroke="' + esc(sf.scn.color) +
        '" stroke-dasharray="' + SCN_DASH[si % SCN_DASH.length] + '"/>';
    });
    s += '<path d="' + baseD + '" class="bal-line" fill="none"/>';
    s += '<line x1="' + padL + '" y1="' + y(0).toFixed(1) + '" x2="' + (W - 12) + '" y2="' + y(0).toFixed(1) + '" class="zero"/>';
    // week labels + tooltips
    fc.forEach(function (w, i) {
      var cx = x(i);
      if (i % 2 === 0) s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 30) + '" class="axis" text-anchor="middle">' + CF.fmtWeek(w).split("–")[0] + "</text>";
      var tip = "Wk " + (i + 1) + " " + CF.fmtWeek(w) + ": in " + CF.money(w.inflow) + ", out " + CF.money(w.outflow) + ", balance " + CF.money(w.balance);
      scnFcs.forEach(function (sf) {
        tip += " | " + sf.scn.name + ": " + CF.money(sf.fc[i].balance);
      });
      s += '<rect x="' + (cx - cw / fc.length / 2).toFixed(1) + '" y="' + padT + '" width="' + (cw / fc.length).toFixed(1) +
        '" height="' + ch + '" class="wk-hit"><title>' + esc(tip) + "</title></rect>";
    });
    s += "</svg>";
    return s;
  }

  // ---------- render ----------
  function renderAlerts(fc, warnAt) {
    warnAt = (warnAt == null) ? 1000 : warnAt;
    var sf = CF.shortfalls(fc, warnAt);
    if (!sf.critical.length && !sf.watch.length)
      return '<div class="alert ok">No shortfalls projected — cash stays positive all ' + fc.length + ' weeks.</div>';
    var h = "";
    if (sf.critical.length) {
      h += '<div class="alert crit"><b>Cash shortfall projected in ' + sf.critical.length + " week(s):</b> " +
        sf.critical.map(function (w) { return "Wk " + (w.index + 1) + " (" + CF.fmtWeek(w) + ", " + CF.money(w.balance) + ")"; }).join("; ") + "</div>";
    }
    if (sf.watch.length) {
      h += '<div class="alert warn"><b>Thin cash (under ' + CF.money(warnAt) + ") in " + sf.watch.length + " week(s):</b> " +
        sf.watch.map(function (w) { return "Wk " + (w.index + 1) + " (" + CF.money(w.balance) + ")"; }).join("; ") + "</div>";
    }
    return h;
  }

  function recBadge(it) {
    var r = CF.recurringLabel(it);
    return r ? ' <span class="badge-rec" title="Repeats ' + r + '">↻ ' + r + "</span>" : "";
  }

  var REC_VALUES = ["weekly", "monthly", "quarterly", "yearly"];
  function normRec(v) { return REC_VALUES.indexOf(v) >= 0 ? v : ""; }
  function recOptions(sel) {
    var labels = { "": "One-time", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };
    return [""].concat(REC_VALUES).map(function (v) {
      return "<option value='" + v + "'" + (v === sel ? " selected" : "") + ">" + labels[v] + "</option>";
    }).join("");
  }

  function itemRows(kind) {
    var q = (kind === "in" ? state.searchIn : state.searchOut).toLowerCase();
    return state.items.filter(function (it) { return it.kind === kind; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .filter(function (it) { return !q || it.desc.toLowerCase().indexOf(q) !== -1; })
      .map(function (it) {
        if (state.editingId === it.id) return editRow(it);
        return "<tr><td>" + esc(it.date) + "</td><td>" + esc(it.desc) + recBadge(it) + "</td><td class='num'>" + CF.money(it.amount) +
          '</td><td class="rowacts"><button class="edit" data-edit="' + esc(it.id) + '" title="Edit">✎</button>' +
          '<button class="del" data-id="' + esc(it.id) + '" title="Remove">✕</button></td></tr>';
      }).join("");
  }

  // Inline edit row: swaps the display row for editable inputs.
  function editRow(it) {
    return "<tr class='editing'><td><input type='date' id='editDate' value='" + esc(it.date) + "'></td>" +
      "<td><input type='text' id='editDesc' value='" + esc(it.desc) + "'>" +
      "<select id='editRec'>" + recOptions(it.recurring || "") + "</select></td>" +
      "<td class='num'><input type='text' id='editAmt' value='" + esc(String(it.amount)) + "'></td>" +
      "<td class='rowacts'><button class='btn btn-mini' id='editSave'>Save</button>" +
      "<button class='btn ghost btn-mini' id='editCancel'>Cancel</button></td></tr>";
  }

  function weekBreakdown(fc) {
    var html = "<div class='tablewrap'><table class='weektable'><thead><tr>" +
      "<th>Week</th><th class='num'>In</th><th class='num'>Out</th><th class='num'>Net</th><th class='num'>Balance</th><th>What's in it</th>" +
      "</tr></thead><tbody>";
    fc.forEach(function (w, i) {
      var items = w.items.map(function (it) {
        return "<span class='wk-item " + it.kind + "'>" + (it.kind === "in" ? "+" : "−") + esc(it.desc) +
          " " + CF.money(it.amount) + (it.occurrence > 0 ? " ↻" : "") + "</span>";
      }).join(" ");
      html += "<tr" + (w.balance < 0 ? " class='wk-crit'" : "") + "><td><b>Wk " + (i + 1) + "</b><br><span class='muted small'>" +
        CF.fmtWeek(w) + "</span></td><td class='num in'>" + CF.money(w.inflow) + "</td><td class='num out'>" +
        CF.money(w.outflow) + "</td><td class='num'>" + CF.money(w.net) + "</td><td class='num'><b>" +
        CF.money(w.balance) + "</b></td><td>" + (items || "<span class='muted'>—</span>") + "</td></tr>";
    });
    return html + "</tbody></table></div>";
  }

  // ---------- scenario desk ----------
  function scnById(id) {
    for (var i = 0; i < state.scenarios.length; i++) if (state.scenarios[i].id === id) return state.scenarios[i];
    return null;
  }

  function cmpRow(name, color, endBal, minBal, critWeeks, minDelta) {
    var dCls = minDelta == null ? "" : (minDelta < -0.005 ? "bad" : minDelta > 0.005 ? "good" : "");
    var dTxt = minDelta == null ? "—" : (minDelta > 0 ? "+" : "") + CF.money(minDelta);
    return '<tr><td><span class="scn-dot" style="background:' + esc(color) + '"></span><b>' + esc(name) + "</b></td>" +
      '<td class="num">' + CF.money(endBal) + '</td><td class="num ' + (minBal < 0 ? "bad" : "") + '">' + CF.money(minBal) + "</td>" +
      '<td class="num ' + (critWeeks > 0 ? "bad" : "") + '">' + critWeeks + '</td><td class="num ' + dCls + '">' + dTxt + "</td></tr>";
  }

  function scenarioDesk(fcBase, scnFcs) {
    var scns = state.scenarios;
    var tabs = scns.map(function (sc) {
      return '<button class="scn-chip' + (state.activeScn === sc.id ? " active" : "") + '" data-scn="' + esc(sc.id) + '">' +
        '<span class="scn-dot" style="background:' + esc(sc.color) + '"></span>' + esc(sc.name) + "</button>";
    }).join("");
    if (scns.length < 3) tabs += '<button class="btn ghost btn-mini" id="scnNew">+ New scenario</button>';
    else tabs += '<span class="muted small">3-scenario max</span>';

    var editor = "";
    var active = scnById(state.activeScn);
    if (active) {
      var all = state.items.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var opts = all.map(function (it) {
        var tag = it.kind === "in" ? "+ " : "− ";
        return '<option value="' + esc(it.id) + '">' + tag + esc(it.desc) + " (" + CF.money(it.amount) + ")" +
          (CF.recurringLabel(it) ? " ↻" : "") + "</option>";
      }).join("");
      var shifts = Object.keys(active.shifts || {}).map(function (id) {
        var it = findItem(id), w = active.shifts[id];
        var lbl = it ? esc(it.desc) : esc(id);
        var kind = it && it.kind === "in" ? "+" : "−";
        return '<div class="shift-row"><span>' + kind + " " + lbl + '</span><span class="shift-w">' +
          (w > 0 ? "+" : "") + w + " wk" + (Math.abs(w) === 1 ? "" : "s") + '</span>' +
          '<button class="del" data-rmshift="' + esc(id) + '" title="Remove shift">✕</button></div>';
      }).join("");
      editor = '<div class="scn-editor"><div class="scn-edit-head">' +
        '<input type="text" id="scnName" value="' + esc(active.name) + '" aria-label="Scenario name" maxlength="40">' +
        '<button class="btn ghost btn-mini" id="scnDel">Delete scenario</button></div>' +
        '<div class="shift-list">' + (shifts || '<p class="muted small">No shifts yet — stack one or more below.</p>') + "</div>" +
        '<div class="shift-add"><select id="shiftItem" aria-label="Item to shift">' + opts + "</select>" +
        '<label class="shift-slider">Weeks <b id="shiftVal">2</b><input type="range" id="shiftRange" min="-4" max="6" value="2"></label>' +
        '<button class="btn btn-mini" id="shiftAdd">Add shift</button></div>' +
        '<p class="muted small">Positive weeks push an item later (a late-paying customer, a delayed bill). Negative pulls it earlier.</p></div>';
    } else if (scns.length) {
      editor = '<p class="muted">Pick a scenario above to edit its shifts.</p>';
    } else {
      editor = '<p class="muted">Name a scenario — e.g. “Big client pays 3 weeks late” — then stack the shifted payments inside it. Its balance line appears on the chart in its own color.</p>';
    }

    var tB = CF.totals(fcBase);
    var cmp = '<div class="tablewrap"><table class="cmptable"><thead><tr><th>Scenario</th>' +
      '<th class="num">Ending balance</th><th class="num">Lowest week</th><th class="num">Shortfall wks</th><th class="num">Lowest vs base</th>' +
      "</tr></thead><tbody>" + cmpRow("Base", "#3c4a54", tB.endBalance, tB.minBalance, CF.shortfalls(fcBase).critical.length, null);
    scnFcs.forEach(function (sf) {
      var d = CF.scenarioDiff(fcBase, sf.fc);
      cmp += cmpRow(sf.scn.name, sf.scn.color, d.scnEnd, d.scnMin, d.scnShortfalls, d.minDelta);
    });
    cmp += "</tbody></table></div>";

    var legend = '<p class="legend"><span class="sw in"></span> money in <span class="sw out"></span> money out ' +
      '<span class="sw bal"></span> base balance' +
      scns.map(function (sc) { return ' <span class="sw scnsw" style="border-color:' + esc(sc.color) + '"></span> ' + esc(sc.name); }).join("") + "</p>";

    return '<section class="card scenario"><div class="scenario-head"><h2>Scenario desk</h2>' +
      '<p class="muted">Float-style what-ifs: name a scenario, stack several shifted payments inside it, and compare every scenario against the base forecast.</p></div>' +
      '<div class="scn-tabs">' + tabs + "</div>" + editor +
      '<h3 class="cmp-head">Scenario comparison</h3>' + cmp + legend + "</section>";
  }

  function render() {
    var fc = baseForecast();
    var scnFcs = scenarioForecasts();
    var t = CF.totals(fc);
    var rw = CF.runwayWeeks(fc);
    var rwTxt = rw === Infinity ? fc.length + "+ wks" : rw + (rw === 1 ? " wk" : " wks");
    var rwTone = rw === Infinity || rw > 8 ? "tone-brass" : rw > 4 ? "tone-ink" : "tone-out";
    var app = document.getElementById("app");
    app.innerHTML =
      '<header class="topbar"><div class="topbar-inner"><div class="brand">' +
      '<span class="brand-mark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 9c2.5 0 2.5 3 5 3s2.5-3 5-3 2.5 3 5 3 2.5-3 5-3"/><path d="M2 15c2.5 0 2.5 3 5 3s2.5-3 5-3 2.5 3 5 3 2.5-3 5-3"/></svg></span>' +
      '<span class="brand-text"><span class="brand-name">CashFlow <em>AI</em></span><span class="brand-sub">' + state.horizon + '-week treasury forecast</span></span></div>' +
      '<div class="topactions"><button id="loadSample" class="btn ghost light">Sample data</button>' +
      '<button id="clearAll" class="btn ghost light">Clear</button>' +
      '<button id="exportFc" class="btn ghost light">Export CSV</button>' +
      '<button id="printReport" class="btn ghost light">Print report</button></div></div></header>' +
      "<main>" +
      '<section class="card hero"><div class="hero-head"><div><h2>' + state.horizon + '-week forecast</h2>' +
      '<p class="muted">Every dollar in and out, week by week &mdash; so a shortfall never surprises you.</p></div>' +
      '<div class="hero-controls"><label class="horizon"><span>Horizon</span><select id="horizonSel">' +
      [4, 13, 26].map(function (w) {
        return '<option value="' + w + '"' + (w === state.horizon ? " selected" : "") + ">" + w + " weeks</option>";
      }).join("") + "</select></label>" +
      '<label class="startbal"><span>Starting balance</span><input type="text" id="startBal" value="' + esc(String(state.startBalance)) + '"></label></div></div>' +
      '<div class="statgrid">' +
      '<div class="stat tone-in"><b>' + CF.money(t.totalIn) + '</b><span>expected in</span></div>' +
      '<div class="stat tone-out"><b>' + CF.money(t.totalOut) + '</b><span>expected out</span></div>' +
      '<div class="stat tone-brass"><b>' + CF.money(t.endBalance) + '</b><span>ending balance</span></div>' +
      '<div class="stat tone-ink"><b>' + CF.money(t.minBalance) + '</b><span>lowest week</span></div>' +
      '<div class="stat ' + rwTone + '"><b>' + rwTxt + '</b><span>cash runway</span></div></div>' +
      '<label class="alertlevel"><span>Low-cash alert level</span><input type="text" id="warnAt" value="' + esc(String(state.warnAt)) + '" title="Warn when weekly balance drops under this amount"></label>' +
      renderAlerts(fc, state.warnAt) + chartSVG(fc, scnFcs) +
      '<p class="legend"><span class="sw in"></span> money in <span class="sw out"></span> money out <span class="sw bal"></span> balance</p>' +
      "</section>" +
      scenarioDesk(fc, scnFcs) +
      '<div class="ledger-grid">' +
      '<section class="card"><h2>Expected money in <span class="count">' + state.items.filter(function (i) { return i.kind === "in"; }).length + "</span></h2>" +
      '<input type="search" id="searchIn" class="ledger-search" placeholder="Search invoices…" value="' + esc(state.searchIn) + '" aria-label="Search invoices">' +
      '<form id="addIn" class="addform"><input type="text" id="inDesc" placeholder="Invoice description" required>' +
      '<input type="date" id="inDate" required><input type="text" id="inAmt" placeholder="Amount" required>' +
      '<select id="inRec" title="Repeat">' + recOptions("") + '</select>' +
      '<button class="btn" type="submit">Add</button></form>' +
      '<div class="tablewrap"><table><thead><tr><th>Expected</th><th>Description</th><th class="num">Amount</th><th></th></tr></thead><tbody>' + itemRows("in") + "</tbody></table></div></section>" +
      '<section class="card"><h2>Expected money out <span class="count">' + state.items.filter(function (i) { return i.kind === "out"; }).length + "</span></h2>" +
      '<input type="search" id="searchOut" class="ledger-search" placeholder="Search bills…" value="' + esc(state.searchOut) + '" aria-label="Search bills">' +
      '<form id="addOut" class="addform"><input type="text" id="outDesc" placeholder="Bill description" required>' +
      '<input type="date" id="outDate" required><input type="text" id="outAmt" placeholder="Amount" required>' +
      '<select id="outRec" title="Repeat">' + recOptions("") + '</select>' +
      '<button class="btn" type="submit">Add</button></form>' +
      '<div class="tablewrap"><table><thead><tr><th>Due</th><th>Description</th><th class="num">Amount</th><th></th></tr></thead><tbody>' + itemRows("out") + "</tbody></table></div></section>" +
      "</div>" +
      '<section class="card"><h2>Weekly breakdown</h2>' +
      '<p class="muted">Every week, every dollar — click through the numbers behind the chart.</p>' +
      weekBreakdown(fc) + "</section>" +
      '<section class="card"><h2>Import CSV</h2>' +
      '<p class="muted">Header: <code>type,description,date,amount</code> — type is <code>in</code> or <code>out</code>, date as YYYY-MM-DD.</p>' +
      '<div class="row"><input type="file" id="csvFile" accept=".csv"><button id="dlSample" class="btn ghost">Sample CSV</button></div>' +
      '<div id="csvMsg" class="csvmsg"></div></section>' +
      '<footer class="foot">CashFlow AI runs 100% in your browser. Forecasts are planning estimates, not financial advice.</footer>' +
      "</main>";
    bind();
  }

  function addItem(kind, desc, dateStr, amtStr, recurring) {
    var amt = CF.parseAmount(amtStr), dt = CF.parseDate(dateStr);
    if (!desc.trim() || !dt || amt == null || amt <= 0) return false;
    var rec = normRec(recurring);
    state.items.push({ id: CF.newId(kind === "in" ? "inv" : "bill"), desc: desc.trim(), date: CF.toISODate(dt), amount: Math.round(amt * 100) / 100, kind: kind, recurring: rec });
    save(); render(); return true;
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  function saveEdit() {
    var it = findItem(state.editingId);
    if (!it) { state.editingId = null; render(); return; }
    var desc = document.getElementById("editDesc").value;
    var dt = CF.parseDate(document.getElementById("editDate").value);
    var amt = CF.parseAmount(document.getElementById("editAmt").value);
    var rec = document.getElementById("editRec").value;
    if (!desc.trim() || !dt || amt == null || amt <= 0) { alert("Fix the highlighted problem: description, a valid date, and an amount above $0 are required."); return; }
    it.desc = desc.trim();
    it.date = CF.toISODate(dt);
    it.amount = Math.round(amt * 100) / 100;
    it.recurring = normRec(rec);
    state.editingId = null;
    save(); render();
  }

  // (Re)binds the edit/delete buttons inside ledger table bodies. Called by
  // bind() and by the live search handlers that swap tbody contents.
  function bindRowButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-edit]"), function (b) {
      b.addEventListener("click", function () {
        state.editingId = b.getAttribute("data-edit");
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".del"), function (b) {
      if (b.hasAttribute("data-rmshift")) return; // scenario shifts bind below
      b.addEventListener("click", function () {
        state.items = state.items.filter(function (it) { return it.id !== b.getAttribute("data-id"); });
        save(); render();
      });
    });
  }

  function bind() {
    document.getElementById("startBal").addEventListener("change", function (e) {
      var v = CF.parseAmount(e.target.value);
      if (v != null && v >= 0) { state.startBalance = v; save(); render(); }
      else { e.target.value = state.startBalance; }
    });
    document.getElementById("warnAt").addEventListener("change", function (e) {
      var v = CF.parseAmount(e.target.value);
      if (v != null && v >= 0) { state.warnAt = v; save(); render(); }
      else { e.target.value = state.warnAt; }
    });
    document.getElementById("searchIn").addEventListener("input", function (e) {
      state.searchIn = e.target.value;
      var tb = document.querySelector("#searchIn").closest(".card").querySelector("tbody");
      if (tb) tb.innerHTML = itemRows("in");
      bindRowButtons();
    });
    document.getElementById("searchOut").addEventListener("input", function (e) {
      state.searchOut = e.target.value;
      var tb = document.querySelector("#searchOut").closest(".card").querySelector("tbody");
      if (tb) tb.innerHTML = itemRows("out");
      bindRowButtons();
    });
    document.getElementById("loadSample").addEventListener("click", function () {
      state.items = CF.SAMPLE_INVOICES.concat(CF.SAMPLE_BILLS);
      state.startBalance = CF.SAMPLE_START_BALANCE;
      save(); render();
    });
    document.getElementById("clearAll").addEventListener("click", function () {
      if (confirm("Remove all invoices and bills?")) { state.items = []; save(); render(); }
    });
    document.getElementById("addIn").addEventListener("submit", function (e) {
      e.preventDefault();
      addItem("in", document.getElementById("inDesc").value, document.getElementById("inDate").value, document.getElementById("inAmt").value, document.getElementById("inRec").value);
    });
    document.getElementById("addOut").addEventListener("submit", function (e) {
      e.preventDefault();
      addItem("out", document.getElementById("outDesc").value, document.getElementById("outDate").value, document.getElementById("outAmt").value, document.getElementById("outRec").value);
    });
    bindRowButtons();
    var editSave = document.getElementById("editSave");
    if (editSave) {
      editSave.addEventListener("click", saveEdit);
      document.getElementById("editCancel").addEventListener("click", function () { state.editingId = null; render(); });
    }
    document.getElementById("exportFc").addEventListener("click", function () {
      var csv = CF.forecastToCSV(baseForecast());
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "cashflow-13-week-forecast.csv";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
    document.getElementById("printReport").addEventListener("click", function () { window.print(); });
    // scenario desk
    var scnNew = document.getElementById("scnNew");
    if (scnNew) scnNew.addEventListener("click", function () {
      var n = state.scenarios.length;
      var sc = { id: CF.newId("scn"), name: "Scenario " + "ABC"[n], shifts: {}, color: scnColor(n) };
      state.scenarios.push(sc);
      state.activeScn = sc.id;
      save(); render();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-scn]"), function (chip) {
      chip.addEventListener("click", function () { state.activeScn = chip.getAttribute("data-scn"); save(); render(); });
    });
    var scnName = document.getElementById("scnName");
    if (scnName) scnName.addEventListener("change", function () {
      var sc = scnById(state.activeScn);
      if (sc && scnName.value.trim()) { sc.name = scnName.value.trim().slice(0, 40); save(); render(); }
    });
    var scnDel = document.getElementById("scnDel");
    if (scnDel) scnDel.addEventListener("click", function () {
      state.scenarios = state.scenarios.filter(function (s) { return s.id !== state.activeScn; });
      state.activeScn = state.scenarios.length ? state.scenarios[state.scenarios.length - 1].id : "";
      save(); render();
    });
    var shiftRange = document.getElementById("shiftRange");
    if (shiftRange) shiftRange.addEventListener("input", function () {
      document.getElementById("shiftVal").textContent = shiftRange.value;
    });
    var shiftAdd = document.getElementById("shiftAdd");
    if (shiftAdd) shiftAdd.addEventListener("click", function () {
      var sc = scnById(state.activeScn);
      var itemId = document.getElementById("shiftItem").value;
      if (!sc || !itemId) return;
      sc.shifts = sc.shifts || {};
      sc.shifts[itemId] = parseInt(shiftRange.value, 10) || 0;
      save(); render();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-rmshift]"), function (b) {
      b.addEventListener("click", function () {
        var sc = scnById(state.activeScn);
        if (sc && sc.shifts) { delete sc.shifts[b.getAttribute("data-rmshift")]; save(); render(); }
      });
    });
    document.getElementById("horizonSel").addEventListener("change", function (e) {
      var v = parseInt(e.target.value, 10);
      state.horizon = [4, 13, 26].indexOf(v) === -1 ? 13 : v;
      save(); render();
    });
    document.getElementById("csvFile").addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var res = CF.rowsToItems(CF.parseCSV(rd.result));
        var msg = document.getElementById("csvMsg");
        var ded = CF.dedupeItems(res.items, state.items);
        if (ded.fresh.length) {
          state.items = state.items.concat(ded.fresh);
          save(); render();
          var bits = ["Imported " + ded.fresh.length + " row" + (ded.fresh.length === 1 ? "" : "s")];
          if (ded.dupes.length) bits.push(ded.dupes.length + " duplicate" + (ded.dupes.length === 1 ? "" : "s") + " skipped");
          if (res.errors.length) bits.push(res.errors.length + " invalid skipped");
          document.getElementById("csvMsg").innerHTML = '<span class="good">' + esc(bits.join(" · ")) + ".</span>";
        } else if (res.items.length) {
          msg.innerHTML = '<span class="bad">No new rows — all ' + res.items.length + " matched existing items.</span>";
        } else {
          msg.innerHTML = '<span class="bad">No rows imported: ' + esc(res.errors.join("; ")) + "</span>";
        }
      };
      rd.readAsText(f);
    });
    document.getElementById("dlSample").addEventListener("click", function () {
      var a = document.createElement("a");
      a.href = "data/sample.csv"; a.download = "cashflow-sample.csv"; a.click();
    });
  }

  document.addEventListener("DOMContentLoaded", render);
})();
