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

  // Japan orders always go to our own company in Japan (Admin › Site settings), falling back to the main number.
  function contact(jc) {
    jc = jc || {};
    return { whatsapp: jc.whatsapp || window.SITE.whatsapp, name: jc.name || window.SITE.name };
  }
  function companyBox(jc) {
    jc = jc || {};
    var esc = TCD.esc, c = contact(jc);
    if (!jc.name) return '<div class="panel japan-co"><b>🇯🇵 Ordered directly from our team</b><p class="hint" style="margin:6px 0 10px">Japan orders are handled by Tanzania Car Dealers ourselves, not by a dealer in Tanzania.</p>' +
      '<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="' + esc(TCD.waLink(c.whatsapp, "Hello, I want to order a car from Japan.")) + '">' + TCD.WA_ICON + 'WhatsApp our Japan team</a></div>';
    var rows = [["Licence", jc.licence], ["Address", jc.address], ["Contact", jc.contactPerson], ["Phone", jc.phone], ["Email", jc.email]].filter(function (r) { return r[1]; });
    return '<div class="panel japan-co"><div class="hint" style="margin:0;font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:12px">Imported directly by our company in Japan</div>' +
      '<h3 style="margin:6px 0 4px;font-size:19px">🇯🇵 ' + esc(jc.name) + '</h3>' + (jc.about ? '<p class="hint" style="margin:0 0 8px;white-space:pre-line">' + esc(jc.about) + '</p>' : "") +
      (rows.length ? '<table class="spec-table" style="font-size:14px">' + rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td style="white-space:pre-line">' + esc(r[1]) + '</td></tr>'; }).join("") + '</table>' : "") +
      '<div class="btns" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="' + esc(TCD.waLink(c.whatsapp, "Hello " + jc.name + ", I want to order a car from Japan.")) + '">' + TCD.WA_ICON + 'WhatsApp Japan</a>' +
      (jc.phone ? '<a class="btn btn-ghost btn-sm" href="tel:' + esc(jc.phone.replace(/[^\d+]/g, "")) + '">📞 Call</a>' : "") +
      (jc.email ? '<a class="btn btn-ghost btn-sm" href="mailto:' + esc(jc.email) + '">✉ Email</a>' : "") +
      (jc.website ? '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="' + esc(jc.website) + '">Website</a>' : "") + '</div></div>';
  }

  window.TCDJapan = { landed: landed, breakdownTable: breakdownTable, ratesNote: ratesNote, TRA_URL: "https://www.tra.go.tz/", contact: contact, companyBox: companyBox };
})();
