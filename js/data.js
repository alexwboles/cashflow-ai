/* CashFlow sample data — realistic small-contractor invoices and bills. Browser + node. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else root.CashFlow = Object.assign(root.CashFlow || {}, factory());
})(typeof self !== "undefined" ? self : this, function () {

  var SAMPLE_INVOICES = [
    { id: "inv-1", desc: "Smith kitchen remodel — final payment", date: "2026-10-02", amount: 8500, kind: "in" },
    { id: "inv-2", desc: "Garcia bathroom reno — milestone 2", date: "2026-10-09", amount: 4200, kind: "in" },
    { id: "inv-3", desc: "Patel roof repair", date: "2026-10-16", amount: 2800, kind: "in" },
    { id: "inv-4", desc: "Nguyen deck build — deposit", date: "2026-10-23", amount: 6000, kind: "in" },
    { id: "inv-5", desc: "Carter HVAC install", date: "2026-11-06", amount: 9500, kind: "in" },
    { id: "inv-6", desc: "Smith kitchen remodel — warranty holdback", date: "2026-11-20", amount: 1500, kind: "in" },
    { id: "inv-7", desc: "Lee fence replacement", date: "2026-12-04", amount: 3300, kind: "in" },
    { id: "inv-8", desc: "Garcia bathroom reno — final", date: "2026-12-18", amount: 4700, kind: "in" }
  ];

  var SAMPLE_BILLS = [
    { id: "bill-1", desc: "Payroll — crew", date: "2026-10-03", amount: 6200, kind: "out" },
    { id: "bill-2", desc: "Lumber yard — materials", date: "2026-10-08", amount: 3100, kind: "out" },
    { id: "bill-3", desc: "Van lease + insurance", date: "2026-10-15", amount: 890, kind: "out" },
    { id: "bill-4", desc: "Payroll — crew", date: "2026-10-17", amount: 6200, kind: "out" },
    { id: "bill-5", desc: "Subcontractor — electrician", date: "2026-10-24", amount: 2400, kind: "out" },
    { id: "bill-6", desc: "Payroll — crew", date: "2026-10-31", amount: 6200, kind: "out" },
    { id: "bill-7", desc: "Quarterly tax estimate", date: "2026-11-14", amount: 4500, kind: "out" },
    { id: "bill-8", desc: "Payroll — crew", date: "2026-11-14", amount: 6200, kind: "out" }
  ];

  var SAMPLE_START_BALANCE = 4000;

  return {
    SAMPLE_INVOICES: SAMPLE_INVOICES,
    SAMPLE_BILLS: SAMPLE_BILLS,
    SAMPLE_START_BALANCE: SAMPLE_START_BALANCE
  };
});