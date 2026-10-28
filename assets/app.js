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
    return { name: car.sellerType === "dealer" && car.businessName ? car.businessName : "Private seller", href: "", verified: false, phone: car.sellerPhone };
  }

  function enquiry(car) {
    return "Hello, I saw your " + title(car) + " on Tanzania Car Dealers (ID " + car.id + ") listed at " + money(car.price) + ". Is it still available?";
  }

  function card(car, dealersById) {
    var s = sellerLabel(car, dealersById || {});
    var href = "/car?id=" + encodeURIComponent(car.id);
    var pic = car.photos && car.photos.length
      ? '<img src="' + esc(car.photos[0]) + '" alt="' + esc(title(car)) + '" loading="lazy">'
      : carSvg(car.swatch);
    return '<article class="car' + (car.featured ? " is-featured" : "") + '">' +
      '<a class="pic" href="' + href + '"><span class="tag">' + esc(car.body) + '</span>' +
      (car.featured ? '<span class="badge-featured">FEATURED</span>' : "") + pic + '</a>' +
      '<div class="body"><h3><a href="' + href + '">' + esc(title(car)) + '</a></h3>' +
      '<div class="price">' + money(car.price) + '</div>' +
      '<div class="specs"><span>' + fmt.format(car.km) + ' km</span><span>' + esc(car.fuel) + '</span><span>' + esc(car.gearbox) + '</span><span>' + esc(car.city) + '</span></div>' +
      '<div class="seller">' + (s.href ? '<a href="' + s.href + '">' + esc(s.name) + '</a>' : esc(s.name)) + (s.verified ? ' <span class="verified">✓ Verified</span>' : "") + '</div>' +
      '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + esc(waLink(s.phone, enquiry(car))) + '">' + WA_ICON + 'Ask on WhatsApp</a></div></article>';
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

  // Staff log in from the header; once a session is saved in this browser it reads "Admin panel".
  function loginButton() {
    if (/^\/admin/.test(location.pathname)) return "";
    var loggedIn = false;
    try { loggedIn = Boolean(localStorage.getItem("tcd_admin_token")); } catch (e) {}
    var label = loggedIn ? "Admin panel" : "Log in";
    return '<a class="btn btn-ghost btn-login" href="/admin" aria-label="' + label + '" title="' + label + '">' +
      '<svg class="wa-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5z"/></svg>' +
      '<span class="label">' + label + '</span></a>';
  }

  function chrome(active) {
    var header = document.createElement("div");
    header.innerHTML =
      '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="wa" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z"/></symbol></svg>' +
      '<div class="flag"></div><header class="top"><div class="wrap nav">' +
      '<a class="brand" href="/"><span class="logo"><svg width="22" height="22" viewBox="0 0 64 64"><path d="M8 38l6-12c1-2 3-3 5-3h26c2 0 4 1 5 3l6 12v8H8z" fill="#fcd116"/><circle cx="20" cy="46" r="6" fill="#111"/><circle cx="44" cy="46" r="6" fill="#111"/></svg></span>' + esc(S.name) + '</a>' +
      '<nav>' + [["cars", "/#stock", "Cars"], ["dealers", "/dealers", "Dealers"], ["sell", "/sell", "Sell your car"]].map(function (n) {
        return '<a href="' + n[1] + '"' + (active === n[0] ? ' class="on"' : "") + '>' + n[2] + '</a>';
      }).join("") + '</nav>' +
      '<div class="actions"><a class="btn btn-main" href="/sell">Sell your car</a>' +
      '<a class="btn btn-wa hide-sm" target="_blank" rel="noopener" href="' + esc(waLink(S.whatsapp, "Hello Tanzania Car Dealers, I am interested in buying a car.")) + '">' + WA_ICON + 'WhatsApp</a>' + loginButton() + '</div>' +
      '</div></header>';
    while (header.firstChild) document.body.insertBefore(header.lastChild, document.body.firstChild);

    var footer = document.createElement("footer");
    footer.innerHTML = '<div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + esc(S.name) + '. All prices in Tanzanian Shillings.</span>' +
      '<span><a href="/sell">Sell your car</a> · <a href="/dealers">Dealers</a> · WhatsApp ' + esc(S.phoneDisplay) + '</span></div>';
    document.body.appendChild(footer);

    var fab = document.createElement("a");
    fab.className = "fab"; fab.target = "_blank"; fab.rel = "noopener"; fab.setAttribute("aria-label", "Chat on WhatsApp");
    fab.href = waLink(S.whatsapp, "Hello Tanzania Car Dealers!");
    fab.innerHTML = '<svg viewBox="0 0 24 24"><use href="#wa"/></svg>';
    document.body.appendChild(fab);
  }

  window.TCD = { esc: esc, waLink: waLink, money: money, fmt: fmt, title: title, carSvg: carSvg, card: card, enquiry: enquiry,
    sellerLabel: sellerLabel, houseCars: houseCars, loadMarket: loadMarket, chrome: chrome, WA_ICON: WA_ICON };
})();
