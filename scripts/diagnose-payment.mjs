#!/usr/bin/env node
/**
 * READ-ONLY diagnostic — resolves a `checkout_reference` to its real SumUp
 * `checkout.id`, cross-checks the locally persisted payment row, and
 * confirms the true PAID/refund status directly with SumUp.
 *
 * STRICTLY NO WRITES: no Prisma .update/.create/.delete, no POST/PUT/PATCH/
 * DELETE to SumUp or Shopify. Safe to run in the Render Shell against
 * production — it only performs SELECTs and GETs.
 *
 * Usage (in the Render Shell for this service, where DATABASE_URL and
 * SUMUP_API_KEY already exist in the environment):
 *
 *   node scripts/diagnose-payment.mjs <checkout_reference>
 *
 * Prints only non-secret fields (the customer e-mail is masked). No token,
 * key, or DB URL is ever printed.
 */
import { PrismaClient } from "@prisma/client";

const reference = process.argv[2];
if (!reference) {
  console.error("Usage: node scripts/diagnose-payment.mjs <checkout_reference>");
  process.exit(1);
}

const mask = (email) => {
  if (typeof email !== "string" || !email.includes("@")) return null;
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
};

const prisma = new PrismaClient();

async function findLocalRow() {
  const [productRow, cartRow] = await Promise.all([
    prisma.sumUpPayment.findUnique({ where: { checkoutReference: reference } }),
    prisma.sumUpCartPayment.findUnique({ where: { checkoutReference: reference } }),
  ]);
  if (productRow && cartRow) {
    return { flow: "AMBIGUOUS", productRow, cartRow };
  }
  if (productRow) return { flow: "product", row: productRow };
  if (cartRow) return { flow: "cart", row: cartRow };
  return { flow: null, row: null };
}

function printLocalRow(flow, row) {
  console.log("\n=== DB (Postgres) — table", flow === "product" ? "SumUpPayment" : "SumUpCartPayment", "===");
  console.log({
    checkoutId: row.checkoutId,
    checkoutReference: row.checkoutReference,
    shop: row.shop,
    status: row.status,
    orderId: row.orderId,
    statusPageUrl: row.statusPageUrl,
    processing: row.processing,
    amount: row.amount,
    currency: row.currency,
    customerEmail: mask(row.customerEmail),
    ...(flow === "product" ? { productId: row.productId, variantId: row.variantId, quantity: row.quantity } : {}),
    ...(flow === "cart" ? { items: row.items, checkoutMode: row.checkoutMode } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

async function sumupListByReference(apiKey, ref) {
  const res = await fetch(
    `https://api.sumup.com/v0.1/checkouts?checkout_reference=${encodeURIComponent(ref)}`,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
  );
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

async function sumupGetById(apiKey, id) {
  const res = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

function printSumUpCheckout(c) {
  console.log({
    id: c.id,
    status: c.status,
    amount: c.amount,
    currency: c.currency,
    checkout_reference: c.checkout_reference,
    merchant_code: c.merchant_code,
    date: c.date,
    transactions: Array.isArray(c.transactions)
      ? c.transactions.map((t) => ({
          id: t.id,
          status: t.status,
          amount: t.amount,
          currency: t.currency,
        }))
      : c.transactions,
  });
}

async function main() {
  console.log("Référence recherchée :", reference);

  const { flow, row, productRow, cartRow } = await findLocalRow();
  if (flow === "AMBIGUOUS") {
    console.log("\n⚠ AMBIGU : une ligne existe dans SumUpPayment ET SumUpCartPayment pour cette référence.");
    printLocalRow("product", productRow);
    printLocalRow("cart", cartRow);
  } else if (flow) {
    printLocalRow(flow, row);
  } else {
    console.log("\n=== DB (Postgres) === aucune ligne trouvée pour cette checkout_reference (ni SumUpPayment ni SumUpCartPayment).");
  }

  const apiKey = process.env.SUMUP_API_KEY;
  if (!apiKey) {
    console.log("\n⚠ SUMUP_API_KEY absente de cet environnement — impossible d'interroger SumUp depuis ici.");
  } else {
    const list = await sumupListByReference(apiKey, reference);
    console.log("\n=== SumUp — GET /v0.1/checkouts?checkout_reference=... ===");
    console.log("HTTP", list.status);
    if (list.ok && Array.isArray(list.body)) {
      console.log(`${list.body.length} résultat(s).`);
      for (const c of list.body) printSumUpCheckout(c);

      if (list.body.length === 1) {
        const id = list.body[0].id;
        console.log("\n=== SumUp — GET /v0.1/checkouts/" + id + " (détail complet) ===");
        const detail = await sumupGetById(apiKey, id);
        console.log("HTTP", detail.status);
        if (detail.ok) printSumUpCheckout(detail.body);
        else console.log(detail.body);

        console.log("\n>>> checkout.id à utiliser pour le rejeu :", id);
      } else if (list.body.length > 1) {
        console.log("\n⚠ Plusieurs checkouts partagent cette référence — ne pas rejouer avant d'avoir identifié le bon (comparer montant/devise/date avec la ligne DB ci-dessus).");
      }
    } else {
      console.log(list.body);
    }
  }

  console.log("\n(Aucune écriture effectuée — ce script est strictement en lecture seule.)");
}

main()
  .catch((err) => {
    console.error("Erreur :", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
