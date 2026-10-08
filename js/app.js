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
    whatIfId: "",
    whatIfWeeks: 0,
    editingId: null
  };
  if (!state.items) {
    state.items = CF.SAMPLE_INVOICES.concat(CF.SAMPLE_BILLS);
    CF.storageSet("items", state.items);
    CF.storageSet("startBalance", state.startBalance);
  }

  function save() {
    CF.storageSet("items", state.items);
    CF.storageSet("startBalance", state.startBalance);
  }

  function baseForecast() { return CF.forecast(state.items, state.startBalance, 13, {}); }
  function whatIfForecast() {
    var shift = {};
    if (state.whatIfId && state.whatIfWeeks > 0) shift[state.whatIfId] = state.whatIfWeeks;
    return CF.forecast(state.items, state.startBalance, 13, shift);
  }

  // ---------- SVG chart ----------
  function chartSVG(fc, fcWhatIf) {
    var W = 860, H = 300, padL = 56, padB = 44, padT = 18;
    var cw = W - padL - 12, ch = H - padT - padB;
    var maxV = 1000;
    fc.forEach(function (w) {
      maxV = Math.max(maxV, w.inflow, w.outflow, Math.abs(w.balance));
    });
    function y(v) { return padT + ch - (v / maxV) * ch; }
    function x(i) { return padL + (i + 0.5) * (cw / fc.length); }
    var bw = Math.min(26, (cw / fc.length) / 3.2);

    var s = '<svg viewBox="0 0 ' + W + " " + H + '" class="chart" role="img" aria-label="13-week cash flow chart">';
    // gridlines
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var gv = Math.round(maxV * f / 500) * 500;
      s += '<line x1="' + padL + '" y1="' + y(gv) + '" x2="' + (W - 12) + '" y2="' + y(gv) + '" class="grid"/>' +
        '<text x="' + (padL - 6) + '" y="' + (y(gv) + 4) + '" class="axis" text-anchor="end">$' + (gv / 1000) + "k</text>";
    });
    // bars: inflow green, outflow red
    fc.forEach(function (w, i) {
      var cx = x(i);
      var crit = w.balance < 0;
      s += '<rect x="' + (cx - bw - 2) + '" y="' + y(w.inflow) + '" width="' + bw + '" height="' + (y(0) - y(w.inflow)) + '" class="bar-in" rx="2"/>';
      s += '<rect x="' + (cx + 2) + '" y="' + y(w.outflow) + '" width="' + bw + '" height="' + (y(0) - y(w.outflow)) + '" class="bar-out" rx="2"/>';
      if (crit) s += '<rect x="' + (cx - bw - 6) + '" y="' + padT + '" width="' + (bw * 2 + 12) + '" height="' + ch + '" class="shortband"/>';
      if (i % 2 === 0) s += '<text x="' + cx + '" y="' + (H - 26) + '" class="axis" text-anchor="middle">' + CF.fmtWeek(w).split("–")[0] + "</text>";
      s += "<title>Wk " + (i + 1) + " " + CF.fmtWeek(w) + ": in " + CF.money(w.inflow) + ", out " + CF.money(w.outflow) + ", balance " + CF.money(w.balance) + "</title>";
    });
    // balance line (what-if dashed)
    function linePath(f, cls) {
      var d = f.map(function (w, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(Math.max(0, w.balance)).toFixed(1); }).join(" ");
      return '<path d="' + d + '" class="' + cls + '" fill="none"/>';
    }
    s += linePath(fc, "bal-line");
    if (fcWhatIf) s += linePath(fcWhatIf, "bal-line whatif");
    s += '<line x1="' + padL + '" y1="' + y(0) + '" x2="' + (W - 12) + '" y2="' + y(0) + '" class="zero"/>';
    s += "</svg>";
    return s;
  }

  // ---------- render ----------
  function renderAlerts(fc) {
    var sf = CF.shortfalls(fc);
    if (!sf.critical.length && !sf.watch.length)
      return '<div class="alert ok">No shortfalls projected — cash stays positive all 13 weeks.</div>';
    var h = "";
    if (sf.critical.length) {
      h += '<div class="alert crit"><b>Cash shortfall projected in ' + sf.critical.length + " week(s):</b> " +
        sf.critical.map(function (w) { return "Wk " + (w.index + 1) + " (" + CF.fmtWeek(w) + ", " + CF.money(w.balance) + ")"; }).join("; ") + "</div>";
    }
    if (sf.watch.length) {
      h += '<div class="alert warn"><b>Thin cash (under $1,000) in ' + sf.watch.length + " week(s):</b> " +
        sf.watch.map(function (w) { return "Wk " + (w.index + 1) + " (" + CF.money(w.balance) + ")"; }).join("; ") + "</div>";
    }
    return h;
  }

  function recBadge(it) {
    var r = CF.recurringLabel(it);
    return r ? ' <span class="badge-rec" title="Repeats ' + r + '">↻ ' + r + "</span>" : "";
  }

  function itemRows(kind) {
    return state.items.filter(function (it) { return it.kind === kind; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
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
      "<select id='editRec'><option value=''>One-time</option>" +
      "<option value='weekly'" + (it.recurring === 'weekly' ? " selected" : "") + ">Weekly</option>" +
      "<option value='monthly'" + (it.recurring === 'monthly' ? " selected" : "") + ">Monthly</option></select></td>" +
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

  function whatIfPanel(fcBase, fcWhat) {
    var ins = state.items.filter(function (it) { return it.kind === "in"; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!state.whatIfId && ins.length) state.whatIfId = ins[0].id;
    var opts = ins.map(function (it) {
      return '<option value="' + esc(it.id) + '"' + (it.id === state.whatIfId ? " selected" : "") + ">" +
        esc(it.desc) + " (" + CF.money(it.amount) + ")</option>";
    }).join("");
    var tB = CF.totals(fcBase), tW = CF.totals(fcWhat);
    var deltaMin = tW.minBalance - tB.minBalance;
    var newCrit = CF.shortfalls(fcWhat).critical.length - CF.shortfalls(fcBase).critical.length;
    var verdict = state.whatIfWeeks === 0
      ? '<p class="muted">Move the slider to simulate a late payment.</p>'
      : '<p class="' + (deltaMin < -0.005 || newCrit > 0 ? "bad" : "good") + '"><b>Impact:</b> lowest weekly balance moves ' +
        CF.money(deltaMin) + " (" + CF.money(tB.minBalance) + " → " + CF.money(tW.minBalance) + ")" +
        (newCrit > 0 ? " — creates " + newCrit + " new shortfall week(s)!" : newCrit < 0 ? " — resolves " + (-newCrit) + " shortfall week(s)." : ".") + "</p>";
    return '<section class="card scenario"><div class="scenario-head"><h2>What-if: late payment</h2>' +
      '<p class="muted">What if a customer pays late? Pick an invoice and slide the delay.</p></div>' +
      '<div class="whatif"><label class="wi-field">Invoice <select id="wiSel">' + opts + "</select></label>" +
      '<label class="wi-field wi-slider">Weeks late: <b id="wiVal">' + state.whatIfWeeks + '</b><input type="range" id="wiRange" min="0" max="6" value="' + state.whatIfWeeks + '"></label></div>' +
      verdict +
      '<p class="muted small">Dashed line on the chart shows the what-if balance. Solid line is your base forecast.</p></section>';
  }

  function render() {
    var fc = baseForecast();
    var fcW = (state.whatIfId && state.whatIfWeeks > 0) ? whatIfForecast() : null;
    var t = CF.totals(fc);
    var app = document.getElementById("app");
    app.innerHTML =
      '<header class="topbar"><div class="topbar-inner"><div class="brand">' +
      '<span class="brand-mark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 9c2.5 0 2.5 3 5 3s2.5-3 5-3 2.5 3 5 3 2.5-3 5-3"/><path d="M2 15c2.5 0 2.5 3 5 3s2.5-3 5-3 2.5 3 5 3 2.5-3 5-3"/></svg></span>' +
      '<span class="brand-text"><span class="brand-name">CashFlow <em>AI</em></span><span class="brand-sub">13-week treasury forecast</span></span></div>' +
      '<div class="topactions"><button id="loadSample" class="btn ghost light">Sample data</button>' +
      '<button id="clearAll" class="btn ghost light">Clear</button>' +
      '<button id="exportFc" class="btn ghost light">Export CSV</button>' +
      '<button id="printReport" class="btn ghost light">Print report</button></div></div></header>' +
      "<main>" +
      '<section class="card hero"><div class="hero-head"><div><h2>13-week forecast</h2>' +
      '<p class="muted">Every dollar in and out, week by week &mdash; so a shortfall never surprises you.</p></div>' +
      '<label class="startbal"><span>Starting balance</span><input type="text" id="startBal" value="' + esc(String(state.startBalance)) + '"></label></div>' +
      '<div class="statgrid">' +
      '<div class="stat tone-in"><b>' + CF.money(t.totalIn) + '</b><span>expected in</span></div>' +
      '<div class="stat tone-out"><b>' + CF.money(t.totalOut) + '</b><span>expected out</span></div>' +
      '<div class="stat tone-brass"><b>' + CF.money(t.endBalance) + '</b><span>ending balance</span></div>' +
      '<div class="stat tone-ink"><b>' + CF.money(t.minBalance) + '</b><span>lowest week</span></div></div>' +
      renderAlerts(fc) + chartSVG(fc, fcW) +
      '<p class="legend"><span class="sw in"></span> money in <span class="sw out"></span> money out <span class="sw bal"></span> balance <span class="sw wi"></span> what-if balance</p>' +
      "</section>" +
      whatIfPanel(fc, fcW || fc) +
      '<div class="ledger-grid">' +
      '<section class="card"><h2>Expected money in <span class="count">' + state.items.filter(function (i) { return i.kind === "in"; }).length + "</span></h2>" +
      '<form id="addIn" class="addform"><input type="text" id="inDesc" placeholder="Invoice description" required>' +
      '<input type="date" id="inDate" required><input type="text" id="inAmt" placeholder="Amount" required>' +
      '<select id="inRec" title="Repeat"><option value="">One-time</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>' +
      '<button class="btn" type="submit">Add</button></form>' +
      '<div class="tablewrap"><table><thead><tr><th>Expected</th><th>Description</th><th class="num">Amount</th><th></th></tr></thead><tbody>' + itemRows("in") + "</tbody></table></div></section>" +
      '<section class="card"><h2>Expected money out <span class="count">' + state.items.filter(function (i) { return i.kind === "out"; }).length + "</span></h2>" +
      '<form id="addOut" class="addform"><input type="text" id="outDesc" placeholder="Bill description" required>' +
      '<input type="date" id="outDate" required><input type="text" id="outAmt" placeholder="Amount" required>' +
      '<select id="outRec" title="Repeat"><option value="">One-time</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>' +
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
    var rec = recurring === "weekly" || recurring === "monthly" ? recurring : "";
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
    it.recurring = rec === "weekly" || rec === "monthly" ? rec : "";
    state.editingId = null;
    save(); render();
  }

  function bind() {
    document.getElementById("startBal").addEventListener("change", function (e) {
      var v = CF.parseAmount(e.target.value);
      if (v != null && v >= 0) { state.startBalance = v; save(); render(); }
      else { e.target.value = state.startBalance; }
    });
    document.getElementById("loadSample").addEventListener("click", function () {
      state.items = CF.SAMPLE_INVOICES.concat(CF.SAMPLE_BILLS);
      state.startBalance = CF.SAMPLE_START_BALANCE; state.whatIfWeeks = 0;
      save(); render();
    });
    document.getElementById("clearAll").addEventListener("click", function () {
      if (confirm("Remove all invoices and bills?")) { state.items = []; state.whatIfWeeks = 0; save(); render(); }
    });
    document.getElementById("addIn").addEventListener("submit", function (e) {
      e.preventDefault();
      addItem("in", document.getElementById("inDesc").value, document.getElementById("inDate").value, document.getElementById("inAmt").value, document.getElementById("inRec").value);
    });
    document.getElementById("addOut").addEventListener("submit", function (e) {
      e.preventDefault();
      addItem("out", document.getElementById("outDesc").value, document.getElementById("outDate").value, document.getElementById("outAmt").value, document.getElementById("outRec").value);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-edit]"), function (b) {
      b.addEventListener("click", function () {
        state.editingId = b.getAttribute("data-edit");
        render();
      });
    });
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
    Array.prototype.forEach.call(document.querySelectorAll(".del"), function (b) {
      b.addEventListener("click", function () {
        state.items = state.items.filter(function (it) { return it.id !== b.getAttribute("data-id"); });
        if (state.whatIfId === b.getAttribute("data-id")) { state.whatIfId = ""; state.whatIfWeeks = 0; }
        save(); render();
      });
    });
    document.getElementById("wiSel").addEventListener("change", function (e) { state.whatIfId = e.target.value; render(); });
    document.getElementById("wiRange").addEventListener("input", function (e) {
      state.whatIfWeeks = +e.target.value;
      document.getElementById("wiVal").textContent = state.whatIfWeeks;
      render();
    });
    document.getElementById("csvFile").addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var res = CF.rowsToItems(CF.parseCSV(rd.result));
        var msg = document.getElementById("csvMsg");
        if (res.items.length) {
          state.items = state.items.concat(res.items);
          save(); render();
          document.getElementById("csvMsg").innerHTML = '<span class="good">Imported ' + res.items.length + " rows" + (res.errors.length ? " (" + res.errors.length + " skipped)" : "") + ".</span>";
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
