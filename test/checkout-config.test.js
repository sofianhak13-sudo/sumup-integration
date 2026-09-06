import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveCheckoutConfig,
  validateContact,
  validateAddress,
  isFieldRequired,
  isFieldVisible,
  PRESETS,
} from "../app/lib/checkout-config.js";

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

test("digital preset: only email, no address, no shipping", () => {
  const c = resolveCheckoutConfig({ advancedCheckoutEnabled: true, checkoutPreset: "digital" });
  assert.equal(c.fields.email, "required");
  assert.equal(c.fields.firstName, "disabled");
  assert.equal(c.fields.phone, "disabled");
  assert.equal(c.shippingAddress, "disabled");
  assert.equal(c.billingAddress, "disabled");
  assert.equal(c.shipping, false);
});

test("ecommerce preset: name + shipping address required", () => {
  const c = resolveCheckoutConfig({
    advancedCheckoutEnabled: true,
    checkoutPreset: "ecommerce",
    shippingEnabled: true,
  });
  assert.equal(c.fields.firstName, "required");
  assert.equal(c.fields.lastName, "required");
  assert.equal(c.shippingAddress, "required");
  assert.equal(c.billingAddress, "same_only");
  assert.equal(c.shipping, true);
});

test("unknown preset falls back to digital", () => {
  const c = resolveCheckoutConfig({ checkoutPreset: "nope" });
  assert.equal(c.preset, "digital");
});

test("field overrides merge over the preset; email stays required", () => {
  const c = resolveCheckoutConfig({
    checkoutPreset: "ecommerce",
    checkoutFieldConfig: { fields: { phone: "required", email: "disabled" }, shippingAddress: "optional" },
  });
  assert.equal(c.fields.phone, "required");
  assert.equal(c.fields.email, "required"); // cannot be turned off
  assert.equal(c.shippingAddress, "optional");
});

test("shippingEnabled master switch forces the delivery module + an address", () => {
  const c = resolveCheckoutConfig({
    checkoutPreset: "digital",
    shippingEnabled: true,
  });
  assert.equal(c.shipping, true);
  assert.equal(c.shippingAddress, "required"); // promoted from "disabled"
});

test("shippingEnabled off => no delivery module even on ecommerce", () => {
  const c = resolveCheckoutConfig({ checkoutPreset: "ecommerce", shippingEnabled: false });
  assert.equal(c.shipping, false);
});

/* -------------------------------------------------------------------------- */
/* Contact validation                                                          */
/* -------------------------------------------------------------------------- */

const ecom = resolveCheckoutConfig({
  advancedCheckoutEnabled: true,
  checkoutPreset: "ecommerce",
  shippingEnabled: true,
});

test("validateContact: rejects bad email", () => {
  const r = validateContact({ email: "nope", firstName: "A", lastName: "B" }, ecom);
  assert.equal(r.ok, false);
  assert.ok(r.errors.email);
});

test("validateContact: required name missing", () => {
  const r = validateContact({ email: "a@b.co" }, ecom);
  assert.equal(r.ok, false);
  assert.ok(r.errors.firstName);
  assert.ok(r.errors.lastName);
});

test("validateContact: optional phone, bad format rejected", () => {
  const r = validateContact(
    { email: "a@b.co", firstName: "A", lastName: "B", phone: "abc" },
    ecom,
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.phone);
});

test("validateContact: happy path returns cleaned values", () => {
  const r = validateContact(
    { email: "  A@B.CO ", firstName: " Jean ", lastName: "Dupont", phone: "+33 6 12 34 56 78" },
    ecom,
  );
  assert.equal(r.ok, true);
  assert.equal(r.values.email, "A@B.CO");
  assert.equal(r.values.firstName, "Jean");
  assert.equal(r.values.phone, "+33 6 12 34 56 78");
});

test("validateContact: disabled field is ignored even if sent", () => {
  const digital = resolveCheckoutConfig({ checkoutPreset: "digital" });
  const r = validateContact({ email: "a@b.co", firstName: "SHOULD BE IGNORED" }, digital);
  assert.equal(r.ok, true);
  assert.equal(r.values.firstName, undefined);
});

/* -------------------------------------------------------------------------- */
/* Address validation                                                          */
/* -------------------------------------------------------------------------- */

test("validateAddress: disabled => always ok, null values", () => {
  const r = validateAddress({ address1: "x" }, "disabled", "shipping");
  assert.equal(r.ok, true);
  assert.equal(r.values, null);
});

test("validateAddress: optional + blank => ok", () => {
  const r = validateAddress({}, "optional", "shipping");
  assert.equal(r.ok, true);
  assert.equal(r.values, null);
});

test("validateAddress: required + missing core fields", () => {
  const r = validateAddress({ firstName: "A" }, "required", "shipping");
  assert.equal(r.ok, false);
  assert.ok(r.errors["shipping.address1"]);
  assert.ok(r.errors["shipping.zip"]);
  assert.ok(r.errors["shipping.city"]);
  assert.ok(r.errors["shipping.countryCode"]);
});

test("validateAddress: province required for US", () => {
  const r = validateAddress(
    { firstName: "A", lastName: "B", address1: "1 Main St", zip: "90001", city: "LA", countryCode: "us" },
    "required",
    "shipping",
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors["shipping.province"]);
});

test("validateAddress: FR without province is fine", () => {
  const r = validateAddress(
    { firstName: "Jean", lastName: "Dupont", address1: "10 rue de Paris", zip: "75001", city: "Paris", countryCode: "FR" },
    "required",
    "shipping",
  );
  assert.equal(r.ok, true);
  assert.equal(r.values.countryCode, "FR");
});

test("helpers: isFieldVisible / isFieldRequired", () => {
  assert.equal(isFieldVisible(ecom, "firstName"), true);
  assert.equal(isFieldRequired(ecom, "firstName"), true);
  assert.equal(isFieldVisible(ecom, "email"), true);
  const digital = resolveCheckoutConfig({ checkoutPreset: "digital" });
  assert.equal(isFieldVisible(digital, "phone"), false);
});

test("PRESETS shape is stable", () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ["custom", "digital", "ecommerce"]);
});
