/**
 * Post-payment return screens (rendered through the app proxy, no theme
 * layout). The order is finalised by the SumUp webhook, not here — this page
 * only polls `statusPageUrl` and always reaches a terminal state (never an
 * infinite "Finalisation…").
 */

const PAGE = (body) =>
  `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;text-align:center;padding:56px 20px;">${body}</div>`;

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

/**
 * The "still finalising" screen: reloads until the webhook writes
 * `statusPageUrl`, then stops with a clear terminal message.
 *
 * @param {object} o
 * @param {string} o.key sessionStorage counter key (per flow)
 * @param {boolean} o.paid whether SumUp already reported PAID
 * @param {string} o.reference checkout reference (shown for support)
 * @param {string} o.shopUrl "/" or the cart URL to link back to
 * @param {number} [o.maxAttempts]
 * @param {number} [o.intervalMs]
 */
export function pendingScreen({ key, paid, reference, shopUrl = "/", maxAttempts = 40, intervalMs = 2000 }) {
  const ref = esc(reference);
  const terminal =
    `<h2>Paiement bien reçu ✅</h2>` +
    `<p>Votre commande est en cours de finalisation chez Shopify. ` +
    `Vous recevrez la confirmation par e-mail dans quelques minutes.</p>` +
    `<p style="color:#666;font-size:13px;">Référence&nbsp;: ${ref}</p>` +
    `<p><a href="${esc(shopUrl)}" style="color:#1a1a1a;">Retour à la boutique</a></p>`;

  return PAGE(
    `<h2>${paid ? "Paiement confirmé" : "Finalisation de votre commande…"}</h2>
     <p>${paid ? "Votre paiement a bien été reçu." : "Nous vérifions votre paiement."}</p>
     <p style="color:#888;font-size:13px;">Merci de patienter, ne fermez pas cette page.</p>
     <script>
       (function(){
         var k=${JSON.stringify(key)};
         var n=Number(sessionStorage.getItem(k)||"0");
         if(n<${maxAttempts}){
           sessionStorage.setItem(k,String(n+1));
           setTimeout(function(){location.reload();}, ${intervalMs});
         } else {
           sessionStorage.removeItem(k);
           document.querySelector("div").innerHTML=${JSON.stringify(terminal)};
         }
       })();
     </script>`,
  );
}

/** Success: clear the cart, redirect to the Shopify order status page. */
export function successScreen({ key, statusPageUrl, cartUrl = "/cart" }) {
  const clearPath = JSON.stringify(String(cartUrl).replace(/\/+$/, "") + "/clear.js");
  return PAGE(
    `<h2>Commande confirmée ✓</h2>
     <p>Redirection vers votre commande…</p>
     <script>
       (async function(){
         try { sessionStorage.removeItem(${JSON.stringify(key)}); } catch(e){}
         try { await fetch(${clearPath}, { method:"POST", credentials:"same-origin" }); } catch(e){}
         location.replace(${JSON.stringify(statusPageUrl)});
       })();
     </script>`,
  );
}
