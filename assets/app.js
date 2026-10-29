// Shared helpers for every page: header/footer, car cards, WhatsApp links, loading listings.
(function () {
  var S = window.SITE;
  var fmt = new Intl.NumberFormat("en-US");
  var WA_ICON = '<svg class="wa-ico" viewBox="0 0 24 24"><use href="#wa"/></svg>';

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function waLink(number, msg) {
    return "https://wa.me/" + number + "?text=" + encodeURIComponent(msg);
  }
  function money(n) { return "TZS " + fmt.format(n); }
  function title(c) { return c.year + " " + c.make + " " + c.model; }

  function carSvg(color) {
    return '<svg viewBox="0 0 200 90" aria-hidden="true"><ellipse cx="100" cy="82" rx="88" ry="5" fill="rgba(0,0,0,.12)"/>' +
      '<path d="M14 62c0-8 4-13 12-15l26-6 22-18c4-3 8-4 13-4h40c6 0 10 2 14 6l16 16 22 4c8 2 12 7 12 14v9H14z" fill="' + esc(color || "#8a96a3") + '" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>' +
      '<path d="M80 28h30v18H58zM116 28h22c4 0 6 1 9 4l12 14h-43z" fill="rgba(140,190,230,.75)"/>' +
      '<circle cx="52" cy="72" r="13" fill="#1a1a1a"/><circle cx="52" cy="72" r="6" fill="#bbb"/>' +
      '<circle cx="154" cy="72" r="13" fill="#1a1a1a"/><circle cx="154" cy="72" r="6" fill="#bbb"/></svg>';
  }

  // Our own stock from cars.js, shaped like marketplace ads.
  function houseCars() {
    return (window.CARS || []).map(function (c) {
      return Object.assign({}, c, {
        id: "h" + c.id, house: true, status: "approved", city: S.location.split(",")[0],
        photos: [], sellerName: S.name, sellerPhone: S.whatsapp, swatch: c.color, color: "",
      });
    });
  }

  function sellerLabel(car, dealersById) {
    var d = car.dealerId && dealersById[car.dealerId];
    if (d) return { name: d.name, href: "/dealer?id=" + d.id, verified: d.verified, phone: d.whatsapp };
    if (car.house) return { name: S.name, href: "/#stock", verified: true, phone: S.whatsapp };
    return { name: car.sellerType === "dealer" && car.businessName ? car.businessName : t("Private seller"), href: "", verified: Boolean(car.sellerVerified), phone: car.sellerPhone };
  }

  function enquiry(car) {
    return "Hello, I saw your " + title(car) + " on Tanzania Car Dealers (ID " + car.id + ") listed at " + money(car.price) + ". Is it still available?";
  }

  // ---- Swahili / English. Strings are keyed by their English text; pages mark static text with
  // data-t (text) and data-tp (placeholder). Anything missing from SW stays in English. ----
  var SW = {
    "Cars": "Magari", "From Japan": "Kutoka Japan", "Dealers": "Wauzaji", "Sell your car": "Uza gari lako", "Saved": "Yaliyohifadhiwa",
    "Log in": "Ingia", "My account": "Akaunti yangu", "Admin panel": "Paneli ya admin", "Private seller": "Muuzaji binafsi",
    "Verified": "Amethibitishwa", "FEATURED": "MAALUM", "Ask on WhatsApp": "Uliza WhatsApp", "TCD Inspected": "Imekaguliwa na TCD",
    "Save": "Hifadhi", "Saved car": "Imehifadhiwa", "All prices in Tanzanian Shillings.": "Bei zote ni kwa Shilingi za Tanzania.",
    "Buy and sell cars in": "Nunua na uza magari", "Tanzania": "Tanzania",
    "Browse cars from verified private sellers and verified dealers. Every seller is checked by our team, with ID documents and a phone call, before they can post.":
      "Tazama magari kutoka kwa wauzaji binafsi na wauzaji wa magari waliothibitishwa. Kila muuzaji anakaguliwa na timu yetu kwa vitambulisho na simu kabla ya kuweka tangazo.",
    "Create an account to sell": "Fungua akaunti ili uuze", "Browse cars": "Tazama magari", "cars for sale": "magari yanauzwa", "dealers": "wauzaji",
    "verified sellers": "wauzaji waliothibitishwa", "Cars for sale": "Magari yanayouzwa",
    "Featured cars are shown first. Tap a car for photos and details, or ask the seller on WhatsApp.": "Magari maalum yanaonyeshwa kwanza. Gusa gari kuona picha na maelezo, au muulize muuzaji kwa WhatsApp.",
    "Search make or model, e.g. Prado": "Tafuta aina au modeli, mf. Prado", "All makes": "Aina zote", "All body types": "Miundo yote", "All cities": "Miji yote",
    "Featured first, newest": "Maalum kwanza, mapya", "Price: low to high": "Bei: chini kwenda juu", "Price: high to low": "Bei: juu kwenda chini",
    "Year: newest first": "Mwaka: mapya kwanza", "Mileage: lowest first": "Kilomita: chache kwanza", "More filters": "Vichujio zaidi",
    "Min price (TZS)": "Bei ya chini (TZS)", "Max price (TZS)": "Bei ya juu (TZS)", "Year from": "Mwaka kuanzia", "Year to": "Mwaka hadi",
    "Max mileage (km)": "Kilomita za juu", "Any gearbox": "Gia yoyote", "Any fuel": "Mafuta yoyote", "2WD or 4WD": "2WD au 4WD", "Any seller": "Muuzaji yeyote",
    "Private sellers": "Wauzaji binafsi", "With photos only": "Yenye picha tu", "Inspected only": "Yaliyokaguliwa tu", "Clear filters": "Futa vichujio",
    "Notify me about new cars like this": "Nijulishe magari mapya kama haya", "Selling a car?": "Unauza gari?",
    "Create an account, upload your ID (or business documents), and once our team verifies you, post your cars. Buyers message you on WhatsApp.":
      "Fungua akaunti, pakia kitambulisho (au nyaraka za biashara), na timu yetu ikikuthibitisha, weka magari yako. Wanunuzi watakutumia ujumbe WhatsApp.",
    "Create an account": "Fungua akaunti", "Import a car from Japan": "Agiza gari kutoka Japan", "See cars from Japan": "Tazama magari ya Japan",
    "See cars from Japanese auctions with the full cost in Dar es Salaam: price, shipping and TRA taxes. Or tell us what you want and we find it.":
      "Tazama magari ya minada ya Japan pamoja na gharama kamili hadi Dar es Salaam: bei, usafirishaji na kodi za TRA. Au tuambie unachotaka tukutafutie.",
    "Why use Tanzania Car Dealers": "Kwa nini utumie Tanzania Car Dealers", "Buying and selling a car should be simple and safe.": "Kununua na kuuza gari kunapaswa kuwa rahisi na salama.",
    "Every seller is verified": "Kila muuzaji amethibitishwa", "Talk on WhatsApp": "Ongea kwa WhatsApp", "Trusted dealers": "Wauzaji wa kuaminika", "Paperwork help": "Msaada wa nyaraka",
    "Details": "Maelezo", "Features": "Vifaa", "Description": "Maelezo zaidi", "Similar cars": "Magari yanayofanana", "Sold by": "Anauzwa na",
    "Chat with seller on WhatsApp": "Ongea na muuzaji WhatsApp", "Call": "Piga simu", "Share": "Shiriki", "Buy safely": "Nunua kwa usalama",
    "See the car in person before paying.": "Liona gari ana kwa ana kabla ya kulipa.", "Check the registration card matches the seller.": "Hakikisha kadi ya usajili inalingana na muuzaji.",
    "Never send a deposit to someone you have not met.": "Usitume malipo ya awali kwa mtu usiyemjua.", "Ask us for an inspection if you are unsure.": "Tuombe ukaguzi kama huna uhakika.",
    "Report this ad": "Ripoti tangazo hili", "PRICE REDUCED": "BEI IMESHUKA", "SOLD": "LIMEUZWA", "Inspection report": "Ripoti ya ukaguzi", "Overall": "Jumla",
    "Mileage checked": "Kilomita zimekaguliwa", "Documents checked": "Nyaraka zimekaguliwa", "No accident damage found": "Hakuna dalili za ajali",
    "Make": "Aina", "Model": "Modeli", "Year": "Mwaka", "Mileage": "Kilomita", "Engine": "Injini", "Fuel": "Mafuta", "Gearbox": "Gia", "Drive": "Uendeshaji",
    "Body type": "Muundo", "Colour": "Rangi", "Assembly": "Uundaji", "Registered in": "Limesajiliwa", "Previous owners": "Wamiliki wa awali", "Location": "Mahali", "Ad ID": "Namba ya tangazo",
    "Your saved cars": "Magari uliyohifadhi", "Cars you save with ♡ are kept on this phone or computer.": "Magari unayohifadhi kwa ♡ yanabaki kwenye simu au kompyuta hii.",
    "No saved cars yet.": "Bado hujahifadhi gari.", "Car not found": "Gari halikupatikana",
  };
  var lang = "en";
  try { lang = localStorage.getItem("tcd_lang") === "sw" ? "sw" : "en"; } catch (e) {}
  function t(s) { return lang === "sw" && SW[s] ? SW[s] : s; }
  function applyI18n(root) {
    if (lang !== "sw") return;
    (root || document).querySelectorAll("[data-t]").forEach(function (el) { var k = el.getAttribute("data-t") || el.textContent.trim(); el.setAttribute("data-t", k); el.textContent = t(k); });
    (root || document).querySelectorAll("[data-tp]").forEach(function (el) { el.placeholder = t(el.getAttribute("data-tp") || el.placeholder); });
    (root || document).querySelectorAll("select[data-t-opts] option").forEach(function (o) { o.textContent = t(o.textContent); });
    document.documentElement.lang = "sw";
  }

  // ---- Saved cars: ids kept in this browser, no account needed ----
  var saved = {
    list: function () { try { return JSON.parse(localStorage.getItem("tcd_saved") || "[]"); } catch (e) { return []; } },
    has: function (id) { return saved.list().indexOf(id) !== -1; },
    toggle: function (id) {
      var l = saved.list(), i = l.indexOf(id);
      if (i === -1) l.unshift(id); else l.splice(i, 1);
      try { localStorage.setItem("tcd_saved", JSON.stringify(l.slice(0, 200))); } catch (e) {}
      document.querySelectorAll("[data-save='" + id + "']").forEach(function (b) { b.classList.toggle("on", i === -1); b.setAttribute("aria-pressed", i === -1); });
      var c = document.getElementById("saved-count"); if (c) c.textContent = l.length ? " (" + l.length + ")" : "";
      return i === -1;
    },
  };
  function saveButton(id, big) {
    var on = saved.has(id);
    return '<button type="button" class="save-btn' + (big ? " big" : "") + (on ? " on" : "") + '" data-save="' + esc(id) + '" aria-pressed="' + on + '" aria-label="' + t("Save") + '" title="' + t("Save") + '">♥</button>';
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-save]"); if (!b) return;
    e.preventDefault(); e.stopPropagation(); saved.toggle(b.dataset.save);
  });

  function inspectedBadge(car) {
    return car.inspection ? '<span class="badge-inspected">✓ ' + t("TCD Inspected") + ' ' + car.inspection.overall + '/10</span>' : "";
  }

  function card(car, dealersById) {
    var s = sellerLabel(car, dealersById || {});
    var href = "/car?id=" + encodeURIComponent(car.id);
    var pic = car.photos && car.photos.length
      ? '<img src="' + esc(car.photos[0]) + '" alt="' + esc(title(car)) + '" loading="lazy">'
      : carSvg(car.swatch);
    return '<article class="car' + (car.featured ? " is-featured" : "") + '">' +
      '<a class="pic" href="' + href + '"><span class="tag">' + esc(car.body) + '</span>' +
      (car.featured ? '<span class="badge-featured">' + t("FEATURED") + '</span>' : "") + inspectedBadge(car) + pic + '</a>' + saveButton(car.id) +
      '<div class="body"><h3><a href="' + href + '">' + esc(title(car)) + '</a></h3>' +
      '<div class="price">' + money(car.price) + '</div>' +
      '<div class="specs"><span>' + fmt.format(car.km) + ' km</span><span>' + esc(car.fuel) + '</span><span>' + esc(car.gearbox) + '</span><span>' + esc(car.city) + '</span></div>' +
      '<div class="seller">' + (s.href ? '<a href="' + s.href + '">' + esc(s.name) + '</a>' : esc(s.name)) + (s.verified ? ' <span class="verified">✓ ' + t("Verified") + '</span>' : "") + '</div>' +
      '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + esc(waLink(s.phone, enquiry(car))) + '">' + WA_ICON + t("Ask on WhatsApp") + '</a></div></article>';
  }

  // Loads approved marketplace ads plus our own stock. Featured ads come first.
  function loadMarket() {
    return fetch("/api/listings").then(function (r) { return r.ok ? r.json() : { ads: [], dealers: [] }; })
      .catch(function () { return { ads: [], dealers: [] }; })
      .then(function (data) {
        var dealersById = {};
        (data.dealers || []).forEach(function (d) { dealersById[d.id] = d; });
        var ads = data.ads || [];
        var featured = ads.filter(function (a) { return a.featured; });
        var rest = ads.filter(function (a) { return !a.featured; });
        return { cars: featured.concat(houseCars(), rest), dealers: data.dealers || [], dealersById: dealersById };
      });
  }

  // One saved login per browser: kind "s" is staff, "m" is a customer member.
  var session = {
    get: function () {
      try { return { token: localStorage.getItem("tcd_token"), kind: localStorage.getItem("tcd_kind") }; } catch (e) { return {}; }
    },
    set: function (token, kind) {
      try { localStorage.setItem("tcd_token", token); localStorage.setItem("tcd_kind", kind); } catch (e) {}
    },
    clear: function () {
      try { localStorage.removeItem("tcd_token"); localStorage.removeItem("tcd_kind"); } catch (e) {}
    },
  };

  // POST to /api/<endpoint> with the saved session. Rejects with the server's error message.
  function api(endpoint, action, data) {
    return fetch("/api/" + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (session.get().token || "") },
      body: JSON.stringify(Object.assign({ action: action }, data || {})),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "Something went wrong"); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  // Shrinks a photo to max `size` px as JPEG so uploads stay small on mobile data.
  function shrinkImage(file, size, quality) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, size / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", quality || 0.8));
      };
      img.onerror = function () { reject(new Error("Could not read " + file.name)); };
      img.src = url;
    });
  }

  function loginButton() {
    if (/^\/(admin|login|account)/.test(location.pathname)) return "";
    // Always "Log in": the Log in page sends people who are already logged in straight to their own page.
    var label = t("Log in"), href = "/login";
    return '<a class="btn btn-ghost btn-login" href="' + href + '" aria-label="' + label + '" title="' + label + '">' +
      '<svg class="wa-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5z"/></svg>' +
      '<span class="label">' + label + '</span></a>';
  }

  function chrome(active) {
    var header = document.createElement("div");
    header.innerHTML =
      '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="wa" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z"/></symbol></svg>' +
      '<div class="flag"></div><header class="top"><div class="wrap nav">' +
      '<a class="brand" href="/"><span class="logo"><svg width="22" height="22" viewBox="0 0 64 64"><path d="M8 38l6-12c1-2 3-3 5-3h26c2 0 4 1 5 3l6 12v8H8z" fill="#fcd116"/><circle cx="20" cy="46" r="6" fill="#111"/><circle cx="44" cy="46" r="6" fill="#111"/></svg></span>' + esc(S.name) + '</a>' +
      '<nav>' + [["cars", "/#stock", "Cars"], ["japan", "/japan", "From Japan"], ["dealers", "/dealers", "Dealers"], ["saved", "/saved", "Saved"]].map(function (n) {
        var count = n[0] === "saved" && saved.list().length ? " (" + saved.list().length + ")" : "";
        return '<a href="' + n[1] + '"' + (active === n[0] ? ' class="on"' : "") + '>' + (n[0] === "saved" ? "♥ " : "") + t(n[2]) + (n[0] === "saved" ? '<span id="saved-count">' + count + '</span>' : "") + '</a>';
      }).join("") + '</nav>' +
      '<div class="actions"><button type="button" class="btn btn-ghost btn-lang" id="lang" title="Kiswahili / English">' + (lang === "sw" ? "EN" : "SW") + '</button>' +
      '<a class="btn btn-main" href="/sell">' + t("Sell your car") + '</a>' +
      '<a class="btn btn-wa hide-sm" target="_blank" rel="noopener" href="' + esc(waLink(S.whatsapp, "Hello Tanzania Car Dealers, I am interested in buying a car.")) + '">' + WA_ICON + 'WhatsApp</a>' + loginButton() + '</div>' +
      '</div></header>';
    while (header.firstChild) document.body.insertBefore(header.lastChild, document.body.firstChild);
    document.getElementById("lang").addEventListener("click", function () {
      try { localStorage.setItem("tcd_lang", lang === "sw" ? "en" : "sw"); } catch (e) {}
      location.reload();
    });

    var footer = document.createElement("footer");
    footer.innerHTML = '<div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + esc(S.name) + '. ' + t("All prices in Tanzanian Shillings.") + '</span>' +
      '<span><a href="/sell">' + t("Sell your car") + '</a> · <a href="/dealers">' + t("Dealers") + '</a> · <a href="/saved">♥ ' + t("Saved") + '</a> · WhatsApp ' + esc(S.phoneDisplay) + '</span></div>';
    document.body.appendChild(footer);
    applyI18n();

    var fab = document.createElement("a");
    fab.className = "fab"; fab.target = "_blank"; fab.rel = "noopener"; fab.setAttribute("aria-label", "Chat on WhatsApp");
    fab.href = waLink(S.whatsapp, "Hello Tanzania Car Dealers!");
    fab.innerHTML = '<svg viewBox="0 0 24 24"><use href="#wa"/></svg>';
    document.body.appendChild(fab);
  }

  // Same list as lib/adfields.js FEATURES (the server ignores anything else).
  var FEATURES = ["Air conditioning", "Climate control", "Power steering", "Power windows", "Power mirrors", "Central locking", "Keyless entry",
    "Push start", "Cruise control", "Steering controls", "ABS", "Airbags", "Traction control", "Immobilizer", "Reverse camera",
    "Parking sensors", "Navigation", "Bluetooth", "Touch screen", "Leather seats", "Heated seats", "Sunroof", "Alloy wheels",
    "Fog lights", "LED headlights", "Roof rails", "Tow bar", "Third row seats"];

  window.TCD = { esc: esc, waLink: waLink, money: money, fmt: fmt, title: title, carSvg: carSvg, card: card, enquiry: enquiry,
    sellerLabel: sellerLabel, houseCars: houseCars, loadMarket: loadMarket, chrome: chrome, WA_ICON: WA_ICON,
    session: session, api: api, shrinkImage: shrinkImage, FEATURES: FEATURES,
    t: t, lang: lang, applyI18n: applyI18n, saved: saved, saveButton: saveButton, inspectedBadge: inspectedBadge };
})();
