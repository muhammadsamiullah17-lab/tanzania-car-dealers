// Landed-cost estimate for a car imported from Japan to Dar es Salaam, using the rates staff set in
// Admin > Import settings. CIF = price in Japan (FOB) + shipping + insurance; TRA taxes follow
// "Taxes and Duties at a Glance": duty, excise (engine + age) and RDL on CIF, VAT on CIF + duty + excise,
// customs processing fee on FOB. TRA's own valuation and assessment are final.
(function () {
  var SIZE = { Hatchback: "small", Sedan: "medium", Wagon: "medium", Coupe: "medium", SUV: "large", MiniVan: "large",
    Van: "large", Pickup: "large", Truck: "xl", Bus: "xl", Other: "medium" };

  function band(list, value, key) {
    for (var i = 0; i < list.length; i++) if (list[i][key] == null || value <= list[i][key]) return list[i].pct;
    return 0;
  }

  // car: { price, currency: "JPY"|"USD", year, cc, body }  s: import settings
  function landed(car, s) {
    var fobUsd = car.currency === "USD" ? Number(car.price) : Number(car.price) / s.jpyPerUsd;
    var freightUsd = s.freightUsd[SIZE[car.body] || "medium"];
    var insuranceUsd = (fobUsd + freightUsd) * s.insurancePct / 100;
    var rate = s.tzsPerUsd;
    var fob = fobUsd * rate, freight = freightUsd * rate, insurance = insuranceUsd * rate;
    var cif = fob + freight + insurance;
    var age = Math.max(0, new Date().getFullYear() - Number(car.year));
    var enginePct = band(s.engineExcise, Number(car.cc), "maxCc");
    var agePct = band(s.ageExcise, age, "maxAge");
    var duty = cif * s.importDutyPct / 100;
    var engineExcise = cif * enginePct / 100;
    var ageExcise = cif * agePct / 100;
    var vat = (cif + duty + engineExcise + ageExcise) * s.vatPct / 100;
    var rdl = cif * s.rdlPct / 100;
    var cpf = fob * s.cpfPct / 100;
    var taxes = duty + engineExcise + ageExcise + vat + rdl + cpf;
    var extras = s.registrationTzs + s.clearingTzs + s.serviceFeeTzs;
    var r = function (n) { return Math.round(n / 1000) * 1000; };
    return {
      age: age, enginePct: enginePct, agePct: agePct, fobUsd: fobUsd, cifUsd: fobUsd + freightUsd + insuranceUsd,
      lines: [
        ["Price in Japan (FOB)", r(fob), "group"],
        ["Shipping to Dar es Salaam", r(freight)],
        ["Marine insurance (" + s.insurancePct + "%)", r(insurance)],
        ["CIF value", r(cif), "subtotal"],
        ["Import duty (" + s.importDutyPct + "% of CIF)", r(duty), "group"],
        ["Excise duty, engine " + car.cc + "cc (" + enginePct + "%)", r(engineExcise)],
        ["Excise duty, age " + age + " years (" + agePct + "%)", r(ageExcise)],
        ["VAT (" + s.vatPct + "%)", r(vat)],
        ["Railway Development Levy (" + s.rdlPct + "%)", r(rdl)],
        ["Customs Processing Fee (" + s.cpfPct + "% of FOB)", r(cpf)],
        ["TRA taxes", r(taxes), "subtotal"],
        ["Registration and number plates", r(s.registrationTzs), "group"],
        ["Clearing, port charges and delivery", s.clearingTzs ? r(s.clearingTzs) : null],
        s.serviceFeeTzs ? ["Our import service fee", r(s.serviceFeeTzs)] : null,
      ].filter(Boolean),
      cif: r(cif), taxes: r(taxes), total: r(cif + taxes + extras),
      missing: !s.clearingTzs,
    };
  }

  function breakdownTable(est) {
    var esc = TCD.esc;
    return '<table class="spec-table cost">' + est.lines.map(function (l) {
      var cls = l[2] === "subtotal" ? ' class="subtotal"' : l[2] === "group" ? ' class="group"' : "";
      return '<tr' + cls + '><td>' + esc(l[0]) + '</td><td style="text-align:right">' + (l[1] == null ? '<span class="hint">ask us</span>' : TCD.money(l[1])) + '</td></tr>';
    }).join("") + '<tr class="total"><td>Estimated total in Dar es Salaam</td><td style="text-align:right">' + TCD.money(est.total) + (est.missing ? " +" : "") + '</td></tr></table>';
  }

  function ratesNote(s) {
    return "Estimate using US$1 = TZS " + TCD.fmt.format(s.tzsPerUsd) + " and US$1 = ¥" + s.jpyPerUsd +
      (s.updatedAt ? " (rates updated " + new Date(s.updatedAt).toLocaleDateString() + ")" : "") +
      ". TRA may value the car from its own database; TRA's assessment is final. Check with the official TRA calculator before you pay.";
  }

  window.TCDJapan = { landed: landed, breakdownTable: breakdownTable, ratesNote: ratesNote, TRA_URL: "https://www.tra.go.tz/" };
})();
