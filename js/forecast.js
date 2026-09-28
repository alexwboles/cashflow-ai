/* CashFlow forecast engine — parsing, 13-week forecast, shortfalls, what-if. Browser + node. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else root.CashFlow = Object.assign(root.CashFlow || {}, factory());
})(typeof self !== "undefined" ? self : this, function () {

  function parseAmount(s) {
    if (s == null) return null;
    var t = String(s).trim().replace(/[$,\s]/g, "");
    var neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t.charAt(0) === "-") { neg = true; t = t.slice(1); }
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    var v = parseFloat(t);
    return neg ? -v : v;
  }

  function parseDate(s) {
    if (s == null) return null;
    var t = String(s).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (m) {
      var d = new Date(+m[1], +m[2] - 1, +m[3]);
      return (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? d : null;
    }
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (m) {
      var d2 = new Date(+m[3], +m[1] - 1, +m[2]);
      return (d2.getFullYear() === +m[3] && d2.getMonth() === +m[1] - 1 && d2.getDate() === +m[2]) ? d2 : null;
    }
    return null;
  }

  function toISODate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function parseCSV(text) {
    var rows = [], row = [], field = "", inQ = false;
    text = String(text || "").replace(/^\uFEFF/, "");
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    return rows;
  }

  // rows -> items. Header: type,description,date,amount  (type = in|out)
  function rowsToItems(rows) {
    if (!rows.length) return { items: [], errors: ["empty file"] };
    var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var ci = { type: head.indexOf("type"), desc: head.indexOf("description"), date: head.indexOf("date"), amt: head.indexOf("amount") };
    if (ci.type < 0 || ci.desc < 0 || ci.date < 0 || ci.amt < 0)
      return { items: [], errors: ["header must be: type,description,date,amount"] };
    var items = [], errors = [];
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row.length || row.every(function (c) { return !String(c).trim(); })) continue;
      var type = String(row[ci.type] || "").trim().toLowerCase();
      var desc = String(row[ci.desc] || "").trim();
      var dt = parseDate(row[ci.date]);
      var amt = parseAmount(row[ci.amt]);
      if (type !== "in" && type !== "out") { errors.push("row " + (r + 1) + ": type must be in|out"); continue; }
      if (!desc) { errors.push("row " + (r + 1) + ": description required"); continue; }
      if (!dt) { errors.push("row " + (r + 1) + ": bad date"); continue; }
      if (amt == null || amt <= 0) { errors.push("row " + (r + 1) + ": amount must be > 0"); continue; }
      items.push({ id: "csv-" + r, desc: desc, date: toISODate(dt), amount: amt, kind: type });
    }
    return { items: items, errors: errors };
  }

  function weekStartOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (x.getDay() + 6) % 7; // Monday = 0
    x.setDate(x.getDate() - dow);
    return x;
  }

  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  // shiftMap: { itemId: weeksLate } — delays 'in' items (what-if late payment)
  function forecast(items, startBalance, weeks, shiftMap) {
    weeks = weeks || 13;
    shiftMap = shiftMap || {};
    var today = new Date();
    var w0 = weekStartOf(today);
    var fc = [];
    for (var w = 0; w < weeks; w++) {
      var ws = addDays(w0, w * 7), we = addDays(w0, w * 7 + 6);
      fc.push({ index: w, start: toISODate(ws), end: toISODate(we), inflow: 0, outflow: 0, net: 0, balance: 0, items: [] });
    }
    (items || []).forEach(function (it) {
      var dt = parseDate(it.date);
      if (!dt) return;
      var late = Math.max(0, Math.min(12, parseInt(shiftMap[it.id] || 0, 10) || 0));
      if (it.kind === "in" && late) dt = addDays(dt, late * 7);
      var wi = Math.floor((weekStartOf(dt) - w0) / (7 * 86400000));
      if (wi < 0) wi = 0;               // overdue / past items land in week 0
      if (wi >= weeks) return;          // beyond the horizon
      if (it.kind === "in") fc[wi].inflow += it.amount; else fc[wi].outflow += it.amount;
      fc[wi].items.push(it);
    });
    var bal = +startBalance || 0;
    fc.forEach(function (wk) {
      wk.net = wk.inflow - wk.outflow;
      bal += wk.net;
      wk.balance = Math.round(bal * 100) / 100;
      wk.inflow = Math.round(wk.inflow * 100) / 100;
      wk.outflow = Math.round(wk.outflow * 100) / 100;
      wk.net = Math.round(wk.net * 100) / 100;
    });
    return fc;
  }

  function shortfalls(fc, warnAt) {
    warnAt = (warnAt == null) ? 1000 : warnAt;
    var crit = [], watch = [];
    (fc || []).forEach(function (wk) {
      if (wk.balance < 0) crit.push(wk);
      else if (wk.balance < warnAt) watch.push(wk);
    });
    return { critical: crit, watch: watch };
  }

  function totals(fc) {
    var t = { totalIn: 0, totalOut: 0, minBalance: Infinity, endBalance: 0 };
    (fc || []).forEach(function (wk) {
      t.totalIn += wk.inflow; t.totalOut += wk.outflow;
      if (wk.balance < t.minBalance) t.minBalance = wk.balance;
    });
    if (fc && fc.length) t.endBalance = fc[fc.length - 1].balance;
    if (t.minBalance === Infinity) t.minBalance = 0;
    t.totalIn = Math.round(t.totalIn * 100) / 100;
    t.totalOut = Math.round(t.totalOut * 100) / 100;
    return t;
  }

  function money(n) {
    var neg = n < 0, v = Math.abs(Math.round(n * 100) / 100);
    var s = v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-$" : "$") + s;
  }

  function fmtWeek(wk) {
    function short(iso) { var p = iso.split("-"); return p[1] + "/" + p[2]; }
    return short(wk.start) + "–" + short(wk.end);
  }

  var _seq = 1;
  function newId(prefix) { return (prefix || "it") + "-" + Date.now().toString(36) + "-" + (_seq++); }

  // ---- storage (localStorage in browser, memory in node/tests) ----
  var _mem = {};
  function storageGet(key, fallback) {
    try {
      if (typeof localStorage !== "undefined") {
        var raw = localStorage.getItem("cashflow:" + key);
        return raw == null ? fallback : JSON.parse(raw);
      }
    } catch (e) {}
    return (key in _mem) ? _mem[key] : fallback;
  }
  function storageSet(key, val) {
    try {
      if (typeof localStorage !== "undefined") { localStorage.setItem("cashflow:" + key, JSON.stringify(val)); return; }
    } catch (e) {}
    _mem[key] = val;
  }

  return {
    parseAmount: parseAmount, parseDate: parseDate, toISODate: toISODate,
    parseCSV: parseCSV, rowsToItems: rowsToItems,
    weekStartOf: weekStartOf, addDays: addDays,
    forecast: forecast, shortfalls: shortfalls, totals: totals,
    money: money, fmtWeek: fmtWeek, newId: newId,
    storageGet: storageGet, storageSet: storageSet
  };
});