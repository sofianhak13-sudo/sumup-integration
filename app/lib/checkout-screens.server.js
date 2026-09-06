/**
 * Server-rendered HTML for the advanced checkout (a standalone storefront
 * page served through the app proxy, no theme layout). No card data is ever
 * collected here — the CTA hands off to the SumUp hosted checkout.
 *
 * The page is deliberately dependency-free: one <style>, one <script>, mobile
 * first. Values are interpolated in JS (never Liquid) so the app-proxy Liquid
 * pass leaves the markup untouched.
 */

import { CONTACT_FIELDS } from "./checkout-config.js";

// A pragmatic country list (ISO-3166-1 alpha-2). Extend as needed from the
// admin later; the server validates against a 2-letter code regardless.
const COUNTRIES = [
  ["FR", "France"], ["BE", "Belgique"], ["CH", "Suisse"], ["LU", "Luxembourg"],
  ["DE", "Allemagne"], ["ES", "Espagne"], ["IT", "Italie"], ["PT", "Portugal"],
  ["NL", "Pays-Bas"], ["GB", "Royaume-Uni"], ["IE", "Irlande"], ["AT", "Autriche"],
  ["DK", "Danemark"], ["SE", "Suède"], ["FI", "Finlande"], ["PL", "Pologne"],
  ["CZ", "Tchéquie"], ["US", "États-Unis"], ["CA", "Canada"], ["AU", "Australie"],
];

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const FIELD_LABELS = {
  email: "E-mail",
  firstName: "Prénom",
  lastName: "Nom",
  phone: "Téléphone",
  company: "Entreprise",
  address1: "Adresse",
  address2: "Complément d'adresse",
  zip: "Code postal",
  city: "Ville",
  province: "Région / Province / État",
  country: "Pays",
};

function labelWithLevel(field, level) {
  const base = FIELD_LABELS[field] || field;
  return level === "optional" ? `${base} (facultatif)` : base;
}

function contactFields(config) {
  const rows = [];
  for (const field of CONTACT_FIELDS) {
    const level = field === "email" ? "required" : config.fields[field];
    if (level === "disabled") continue;
    const req = level === "required";
    const type = field === "email" ? "email" : field === "phone" ? "tel" : "text";
    const auto =
      field === "email" ? "email"
      : field === "phone" ? "tel"
      : field === "firstName" ? "given-name"
      : field === "lastName" ? "family-name"
      : field === "company" ? "organization"
      : "off";
    rows.push(
      `<label class="f"><span>${esc(labelWithLevel(field, level))}</span>` +
      `<input name="${field}" type="${type}" autocomplete="${auto}" ${req ? "required" : ""} ` +
      `inputmode="${field === "email" ? "email" : field === "phone" ? "tel" : "text"}"></label>`,
    );
  }
  return rows.join("");
}

function addressFields(prefix, level) {
  if (level === "disabled") return "";
  const opt = level === "optional";
  const F = (name, extra = "") =>
    `<label class="f"><span>${esc(FIELD_LABELS[name] || name)}</span>` +
    `<input name="${prefix}.${name}" ${extra}></label>`;
  return `
    <div class="grid2">
      ${F("firstName", 'autocomplete="given-name"')}
      ${F("lastName", 'autocomplete="family-name"')}
    </div>
    ${F("company", 'autocomplete="organization"')}
    ${F("address1", 'autocomplete="address-line1"')}
    ${F("address2", 'autocomplete="address-line2"')}
    <div class="grid2">
      ${F("zip", 'autocomplete="postal-code" inputmode="text"')}
      ${F("city", 'autocomplete="address-level2"')}
    </div>
    <div class="grid2">
      ${F("province", 'autocomplete="address-level1"')}
      <label class="f"><span>${esc(FIELD_LABELS.country)}</span>
        <select name="${prefix}.countryCode" autocomplete="country">
          <option value="">— Choisir —</option>
          ${COUNTRIES.map(([code, name]) => `<option value="${code}">${esc(name)}</option>`).join("")}
        </select>
      </label>
    </div>
    <p class="hint" data-addr-note="${prefix}"${opt ? "" : ' hidden'}>${opt ? "Laissez vide si vous ne souhaitez pas la renseigner." : ""}</p>
  `;
}

/**
 * The full checkout page.
 * @param {object} args
 * @param {object} args.config resolved checkout config
 * @param {string} args.cartUrl
 * @param {string} args.actionPath e.g. "/apps/sumup-pay/checkout"
 * @param {string} [args.customerEmail]
 */
export function checkoutPage({ config, cartUrl = "/cart", actionPath, customerEmail = "" }) {
  const a = config.appearance;
  const showBilling = config.billingAddress !== "disabled";
  const billingCanDiffer = config.billingAddress === "optional" || config.billingAddress === "required";
  const cfgJson = JSON.stringify({
    fields: config.fields,
    shippingAddress: config.shippingAddress,
    billingAddress: config.billingAddress,
    shipping: config.shipping,
    actionPath,
    cartUrl,
    customerEmail: customerEmail || "",
  }).replace(/</g, "\\u003c");

  return `<!-- sumup advanced checkout -->
<div id="sumup-checkout" style="--accent:${esc(a.accent)};--on-accent:${esc(a.onAccent)};--radius:${Number(a.radius) || 10}px;--maxw:${Number(a.maxWidth) || 560}px">
  <style>
    #sumup-checkout{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;background:#f6f6f7;min-height:100vh;padding:24px 16px 64px;box-sizing:border-box}
    #sumup-checkout *{box-sizing:border-box}
    #sumup-checkout .wrap{max-width:var(--maxw);margin:0 auto}
    #sumup-checkout h1{font-size:20px;margin:0 0 4px}
    #sumup-checkout .sub{color:#616161;margin:0 0 20px;font-size:14px}
    #sumup-checkout .card{background:#fff;border:1px solid #e3e3e3;border-radius:var(--radius);padding:16px;margin:0 0 16px}
    #sumup-checkout h2{font-size:15px;margin:0 0 12px}
    #sumup-checkout .f{display:block;margin:0 0 10px}
    #sumup-checkout .f span{display:block;font-size:13px;color:#444;margin:0 0 4px}
    #sumup-checkout .f input,#sumup-checkout .f select{width:100%;padding:11px 12px;border:1px solid #b5b5b5;border-radius:8px;font-size:16px;background:#fff}
    #sumup-checkout .f input:focus,#sumup-checkout .f select:focus{outline:2px solid var(--accent);border-color:var(--accent)}
    #sumup-checkout .grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
    @media (max-width:420px){#sumup-checkout .grid2{grid-template-columns:1fr}}
    #sumup-checkout .hint{font-size:12px;color:#757575;margin:4px 0 0}
    #sumup-checkout .chk{display:flex;align-items:center;gap:8px;font-size:14px;margin:4px 0 12px}
    #sumup-checkout .chk input{width:18px;height:18px}
    #sumup-checkout .sumline{display:flex;justify-content:space-between;font-size:14px;padding:4px 0}
    #sumup-checkout .sumline.total{font-weight:700;font-size:16px;border-top:1px solid #e3e3e3;margin-top:8px;padding-top:10px}
    #sumup-checkout .item{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
    #sumup-checkout .item img{width:48px;height:48px;object-fit:cover;border-radius:6px;background:#eee}
    #sumup-checkout .item .q{color:#616161}
    #sumup-checkout .ship-opt{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #d0d0d0;border-radius:8px;margin:0 0 8px;font-size:14px;cursor:pointer}
    #sumup-checkout .ship-opt input{width:18px;height:18px}
    #sumup-checkout button.cta{width:100%;padding:14px;border:0;border-radius:var(--radius);background:var(--accent);color:var(--on-accent);font-size:16px;font-weight:600;cursor:pointer;margin-top:4px}
    #sumup-checkout button.cta[disabled]{opacity:.55;cursor:progress}
    #sumup-checkout .err{background:#fff0f0;border:1px solid #e0b4b4;color:#8a1f11;border-radius:8px;padding:10px 12px;font-size:13px;margin:0 0 12px}
    #sumup-checkout .fielderr{color:#8a1f11;font-size:12px;margin:-6px 0 10px}
    #sumup-checkout .trust{text-align:center;color:#616161;font-size:12px;margin:12px 0 0}
    #sumup-checkout .muted{color:#9e9e9e}
    #sumup-checkout a{color:var(--accent)}
    #sumup-checkout .logo{max-height:40px;margin:0 0 12px}
  </style>

  <div class="wrap">
    ${a.logoUrl ? `<img class="logo" src="${esc(a.logoUrl)}" alt="">` : ""}
    <h1>${esc(a.title || "Finaliser la commande")}</h1>
    ${a.subtitle ? `<p class="sub">${esc(a.subtitle)}</p>` : `<p class="sub">Vos articles seront réglés via SumUp.</p>`}

    <div class="err" id="co-error" hidden></div>

    <form id="co-form" novalidate>
      <div class="card">
        <h2>Récapitulatif</h2>
        <div id="co-items"><p class="muted">Chargement du panier…</p></div>
        <div id="co-summary"></div>
      </div>

      <div class="card">
        <h2>Contact</h2>
        ${contactFields(config)}
      </div>

      ${config.shippingAddress !== "disabled" ? `
      <div class="card">
        <h2>Adresse de livraison</h2>
        ${addressFields("shipping", config.shippingAddress)}
      </div>` : ""}

      ${showBilling ? `
      <div class="card">
        <h2>Adresse de facturation</h2>
        <label class="chk"><input type="checkbox" name="billingSame" value="1" checked> Identique à l'adresse de livraison</label>
        ${billingCanDiffer ? `<div id="co-billing" hidden>${addressFields("billing", "required")}</div>` : ""}
      </div>` : ""}

      ${config.shipping ? `
      <div class="card">
        <h2>Livraison</h2>
        <div id="co-ship"><p class="muted">Renseignez votre adresse pour voir les modes de livraison.</p></div>
        <input type="hidden" name="shippingOptionHandle" value="">
      </div>` : ""}

      <button type="submit" class="cta" id="co-cta">${esc(a.ctaLabel || "Payer avec SumUp")}</button>
      ${a.showTrust ? `<p class="trust">🔒 ${esc(a.trustText || "Paiement sécurisé par SumUp.")}</p>` : ""}
      ${a.legalText ? `<p class="trust">${a.legalUrl ? `<a href="${esc(a.legalUrl)}" target="_blank" rel="noopener">${esc(a.legalText)}</a>` : esc(a.legalText)}</p>` : ""}
      <p class="trust"><a href="${esc(cartUrl)}">← Retour au panier</a></p>
    </form>
  </div>

  <script>${checkoutClientJs()}
  window.__sumupCheckoutBoot(${cfgJson});
  </script>
</div>`;
}

/* -------------------------------------------------------------------------- */
/* Client script — kept as a plain string so it survives the Liquid pass.      */
/* -------------------------------------------------------------------------- */

function checkoutClientJs() {
  return `
window.__sumupCheckoutBoot = function (CFG) {
  "use strict";
  var form = document.getElementById("co-form");
  var errBox = document.getElementById("co-error");
  var cta = document.getElementById("co-cta");
  var EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  var PHONE_RE = /^\\+?[0-9]{6,20}$/;
  var money = function (cents, cur) {
    try { return new Intl.NumberFormat(undefined,{style:"currency",currency:cur||"EUR"}).format((cents||0)/100); }
    catch(e){ return ((cents||0)/100).toFixed(2)+" "+(cur||"EUR"); }
  };
  var cart = null, quote = null, shipReqSeq = 0;

  function showErr(msg){ errBox.textContent = msg || ""; errBox.hidden = !msg; if(msg) errBox.scrollIntoView({block:"center"}); }
  function fieldErr(name, msg){
    var el = form.querySelector('[name="'+name+'"]'); if(!el) return;
    var box = el.parentNode.querySelector(".fielderr");
    if(!box){ box = document.createElement("p"); box.className="fielderr"; el.parentNode.appendChild(box); }
    box.textContent = msg || ""; box.hidden = !msg;
  }
  function clearFieldErrs(){ form.querySelectorAll(".fielderr").forEach(function(b){ b.textContent=""; b.hidden=true; }); }

  function renderItems(){
    var box = document.getElementById("co-items");
    if(!cart || !cart.items || !cart.items.length){ box.innerHTML = '<p class="muted">Votre panier est vide.</p>'; cta.disabled = true; return; }
    box.innerHTML = cart.items.map(function(i){
      return '<div class="item">'+(i.image?'<img src="'+i.image+'" alt="">':'<img alt="">')+
        '<div><div>'+escapeHtml(i.product_title||i.title)+'</div>'+
        (i.variant_title?'<div class="q">'+escapeHtml(i.variant_title)+'</div>':'')+
        '<div class="q">Quantité : '+i.quantity+'</div></div>'+
        '<div style="margin-left:auto">'+money(i.final_line_price, cart.currency)+'</div></div>';
    }).join("");
  }
  function renderSummary(){
    var box = document.getElementById("co-summary");
    var cur = (quote && quote.currencyCode) || cart && cart.currency || "EUR";
    var sub = quote ? quote.catalogSubtotalCents : (cart ? cart.items_subtotal_price : 0);
    var lines = ['<div class="sumline"><span>Sous-total</span><span>'+money(sub,cur)+'</span></div>'];
    if(quote && quote.discountCents>0) lines.push('<div class="sumline"><span>Remises</span><span>−'+money(quote.discountCents,cur)+'</span></div>');
    if(CFG.shipping) lines.push('<div class="sumline"><span>Livraison</span><span>'+(quote&&quote.shippingCents!=null?money(quote.shippingCents,cur):'—')+'</span></div>');
    if(quote && quote.taxCents>0) lines.push('<div class="sumline"><span>TVA incluse</span><span>'+money(quote.taxCents,cur)+'</span></div>');
    var total = quote ? quote.totalCents : (cart ? cart.total_price : 0);
    lines.push('<div class="sumline total"><span>Total</span><span>'+money(total,cur)+'</span></div>');
    box.innerHTML = lines.join("");
  }
  function escapeHtml(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }

  function collect(){
    var fd = new FormData(form);
    var o = {};
    fd.forEach(function(v,k){ o[k] = typeof v === "string" ? v : ""; });
    return o;
  }

  function validate(values){
    clearFieldErrs();
    var ok = true;
    if(!EMAIL_RE.test((values.email||"").trim())){ fieldErr("email","Adresse e-mail invalide."); ok=false; }
    ["firstName","lastName","company"].forEach(function(f){
      if(CFG.fields[f]==="disabled") return;
      var v=(values[f]||"").trim();
      if(!v && CFG.fields[f]==="required"){ fieldErr(f,"Ce champ est obligatoire."); ok=false; }
    });
    if(CFG.fields.phone!=="disabled"){
      var p=(values.phone||"").trim();
      if(!p && CFG.fields.phone==="required"){ fieldErr("phone","Le téléphone est obligatoire."); ok=false; }
      else if(p && !PHONE_RE.test(p.replace(/[\\s().-]/g,""))){ fieldErr("phone","Numéro invalide."); ok=false; }
    }
    if(CFG.shippingAddress!=="disabled") ok = validateAddr("shipping", CFG.shippingAddress, values) && ok;
    var billingSame = form.querySelector('[name="billingSame"]');
    if(CFG.billingAddress!=="disabled" && billingSame && !billingSame.checked)
      ok = validateAddr("billing","required",values) && ok;
    if(CFG.shipping){
      var h = form.querySelector('[name="shippingOptionHandle"]');
      if(!h || !h.value){ showErr("Sélectionnez un mode de livraison."); ok=false; }
    }
    return ok;
  }
  function validateAddr(prefix, level, values){
    var keys=["firstName","lastName","address1","zip","city"];
    var filled = keys.concat(["address2","province","countryCode"]).some(function(k){ return (values[prefix+"."+k]||"").trim(); });
    if(level==="optional" && !filled) return true;
    var ok=true;
    keys.forEach(function(k){ if(!(values[prefix+"."+k]||"").trim()){ fieldErr(prefix+"."+k,"Ce champ est obligatoire."); ok=false; } });
    if(!(values[prefix+".countryCode"]||"").trim()){ fieldErr(prefix+".countryCode","Pays obligatoire."); ok=false; }
    return ok;
  }

  // --- server round-trips ---
  function post(intent, extra){
    var body = new URLSearchParams();
    body.set("intent", intent);
    body.set("cart", JSON.stringify({ items: (cart&&cart.items||[]).map(function(i){return {variant_id:i.variant_id,quantity:i.quantity};}) }));
    body.set("cartToken", (cart&&cart.token)||"");
    body.set("cartTotal", cart&&typeof cart.total_price==="number"?String(cart.total_price):"");
    body.set("discountCodes", JSON.stringify(((cart&&cart.discount_codes)||[]).filter(function(d){return d&&d.code&&d.applicable!==false;}).map(function(d){return d.code;})));
    var attrs=[]; var raw=(cart&&cart.attributes)||{}; Object.keys(raw).forEach(function(k){attrs.push({key:k,value:String(raw[k])});});
    body.set("cartAttributes", JSON.stringify(attrs));
    var v = collect();
    Object.keys(v).forEach(function(k){ if(k!=="intent"&&k!=="cart") body.set(k, v[k]); });
    if(extra) Object.keys(extra).forEach(function(k){ body.set(k, extra[k]); });
    return fetch(CFG.actionPath, {
      method:"POST", credentials:"same-origin",
      headers:{ "Content-Type":"application/x-www-form-urlencoded", "Accept":"application/json" },
      body: body.toString(), redirect:"manual",
    });
  }

  function refreshQuote(){
    return post("quote").then(function(r){ return r.json(); }).then(function(j){
      if(j && j.ok){ quote = j.breakdown; renderSummary(); showErr(""); }
      else if(j && j.blocked){ showErr(j.message || "Votre panier a besoin d'être actualisé."); }
      return j;
    }).catch(function(){});
  }

  function refreshShipping(){
    if(!CFG.shipping) return Promise.resolve();
    var v = collect();
    if(!(v["shipping.zip"]||"").trim() || !(v["shipping.countryCode"]||"").trim()) return Promise.resolve();
    var box = document.getElementById("co-ship");
    box.innerHTML = '<p class="muted">Calcul des modes de livraison…</p>';
    var seq = ++shipReqSeq;
    return post("shipping").then(function(r){ return r.json(); }).then(function(j){
      if(seq!==shipReqSeq) return;
      if(!j || !j.ok || !j.options || !j.options.length){
        box.innerHTML = '<p class="fielderr" hidden></p><p class="muted">'+((j&&j.message)||"Aucun mode de livraison pour cette adresse.")+'</p>';
        form.querySelector('[name="shippingOptionHandle"]').value="";
        return;
      }
      box.innerHTML = j.options.map(function(o,idx){
        return '<label class="ship-opt"><input type="radio" name="shipopt" value="'+escapeHtml(o.handle)+'"'+(idx===0?" checked":"")+'>'+
          '<span>'+escapeHtml(o.title)+'</span><span style="margin-left:auto">'+money(o.amountCents,o.currencyCode)+'</span></label>';
      }).join("");
      form.querySelector('[name="shippingOptionHandle"]').value = j.options[0].handle;
      box.querySelectorAll('input[name="shipopt"]').forEach(function(r){
        r.addEventListener("change", function(){
          form.querySelector('[name="shippingOptionHandle"]').value = r.value;
          refreshQuote();
        });
      });
      refreshQuote();
    }).catch(function(){ if(seq===shipReqSeq) box.innerHTML='<p class="muted">Livraison indisponible pour le moment.</p>'; });
  }

  // --- wiring ---
  var billingSame = form.querySelector('[name="billingSame"]');
  var billingBox = document.getElementById("co-billing");
  if(billingSame && billingBox){
    billingSame.addEventListener("change", function(){ billingBox.hidden = billingSame.checked; });
  }
  var shipDebounce;
  function onShipEdit(e){
    var n = e.target && e.target.name || "";
    if(n.indexOf("shipping.")===0){ clearTimeout(shipDebounce); shipDebounce = setTimeout(refreshShipping, 600); }
  }
  form.addEventListener("input", onShipEdit);
  form.addEventListener("change", onShipEdit);

  form.addEventListener("submit", function(e){
    e.preventDefault();
    showErr("");
    if(!cart || !cart.items || !cart.items.length){ showErr("Votre panier est vide."); return; }
    var values = collect();
    if(!validate(values)) return;
    cta.disabled = true;
    var prev = cta.textContent; cta.textContent = "Redirection…";
    post("pay").then(function(r){
      var loc = r.headers.get("Location");
      if((r.status===303||r.status===302) && loc){ location.assign(loc); return; }
      return r.json().then(function(j){
        if(j && j.redirect){ location.assign(j.redirect); return; }
        cta.disabled = false; cta.textContent = prev;
        showErr((j && j.message) || "Le paiement est momentanément indisponible. Veuillez réessayer.");
      });
    }).catch(function(){
      cta.disabled = false; cta.textContent = prev;
      showErr("Le paiement est momentanément indisponible. Veuillez réessayer.");
    });
  });

  // --- boot: (optionally add a product), load the cart, then a first quote ---
  function maybeAdd(){
    try {
      var q = new URLSearchParams(location.search);
      var add = q.get("add");
      if(!add) return Promise.resolve();
      var qty = Math.max(1, parseInt(q.get("qty")||"1", 10) || 1);
      return fetch(CFG.cartUrl.replace(/\\/$/,"")+"/add.js", {
        method:"POST", credentials:"same-origin",
        headers:{ "Content-Type":"application/json", Accept:"application/json" },
        body: JSON.stringify({ items:[{ id: Number(add) || add, quantity: qty }] }),
      }).then(function(){
        // Drop the params so a reload doesn't re-add.
        history.replaceState(null, "", location.pathname);
      }).catch(function(){});
    } catch(e){ return Promise.resolve(); }
  }

  maybeAdd().then(function(){
  fetch(CFG.cartUrl.replace(/\\/$/,"")+".js", { headers:{ Accept:"application/json" } })
    .then(function(r){ return r.json(); })
    .then(function(c){
      cart = c;
      // prefill known email
      var em = CFG.customerEmail || "";
      if(em){ var f = form.querySelector('[name="email"]'); if(f && !f.value) f.value = em; }
      renderItems(); renderSummary();
      if(!cart.items || !cart.items.length){ cta.disabled = true; return; }
      refreshQuote();
    })
    .catch(function(){ document.getElementById("co-items").innerHTML = '<p class="muted">Impossible de charger le panier.</p>'; });
  });
};`;
}
