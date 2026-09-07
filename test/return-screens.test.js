import { test } from "node:test";
import assert from "node:assert/strict";

import { pendingScreen, successScreen } from "../app/lib/return-screens.server.js";

test("pendingScreen: bounded polling, terminal message, no infinite loop", () => {
  const html = pendingScreen({ key: "k", paid: true, reference: "co-123", shopUrl: "/" });
  assert.ok(html.includes("n<40")); // capped
  assert.ok(html.includes("location.reload()"));
  assert.ok(html.includes("sessionStorage.removeItem(k)")); // stops after cap
  assert.ok(html.includes("co-123")); // reference shown for support
  assert.ok(html.includes("Paiement confirmé"));
  assert.ok(!html.includes("{{"));
  assert.ok(!html.includes("{%"));
});

test("pendingScreen: not-yet-paid wording", () => {
  const html = pendingScreen({ key: "k", paid: false, reference: "co-9", shopUrl: "/" });
  assert.ok(html.includes("Finalisation de votre commande"));
  assert.ok(html.includes("Nous vérifions votre paiement"));
});

test("successScreen: clears cart then redirects to the order status page", () => {
  const html = successScreen({
    key: "k",
    statusPageUrl: "https://shop.example/orders/1/authenticate?key=abc",
    cartUrl: "/cart",
  });
  assert.ok(html.includes('"/cart/clear.js"'));
  assert.ok(html.includes("location.replace"));
  assert.ok(html.includes("orders/1/authenticate"));
  assert.ok(html.includes("Commande confirmée"));
});
