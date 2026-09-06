/**
 * Pure Checkout V2 configuration + validation helpers (no DB, no network).
 *
 * The merchant configures the advanced checkout with a preset
 * ("digital" | "ecommerce" | "custom") plus optional per-field overrides.
 * `resolveCheckoutConfig` turns a stored `MerchantSettings` row into the
 * single effective config the storefront page and the server both read, so
 * the browser can never widen what the server enforces.
 */

/** Requirement levels for a single field. */
export const FIELD_LEVELS = ["disabled", "optional", "required"];

/** Contact fields the merchant can toggle (email is always required). */
export const CONTACT_FIELDS = ["email", "firstName", "lastName", "phone", "company"];

/** Address section levels. */
export const SECTION_LEVELS = ["disabled", "optional", "required"];

/** Billing behaviour: no billing / only "same as shipping" / a distinct form. */
export const BILLING_MODES = ["disabled", "same_only", "optional", "required"];

/** Country codes (ISO-3166-1 alpha-2) that require a province/state. */
export const PROVINCE_REQUIRED = new Set([
  "US", "CA", "AU", "IE", "IT", "ES", "JP", "BR", "MX", "IN", "CN", "AR",
]);

const clone = (o) => JSON.parse(JSON.stringify(o));

export const PRESETS = {
  digital: {
    label: "Numérique",
    fields: {
      email: "required",
      firstName: "disabled",
      lastName: "disabled",
      phone: "disabled",
      company: "disabled",
    },
    shippingAddress: "disabled",
    billingAddress: "disabled",
    shipping: false,
  },
  ecommerce: {
    label: "E-commerce",
    fields: {
      email: "required",
      firstName: "required",
      lastName: "required",
      phone: "optional",
      company: "optional",
    },
    shippingAddress: "required",
    billingAddress: "same_only",
    shipping: true,
  },
  custom: {
    label: "Personnalisé",
    fields: {
      email: "required",
      firstName: "optional",
      lastName: "optional",
      phone: "optional",
      company: "disabled",
    },
    shippingAddress: "optional",
    billingAddress: "disabled",
    shipping: false,
  },
};

export const DEFAULT_APPEARANCE = {
  logoUrl: "",
  title: "Finaliser la commande",
  subtitle: "",
  accent: "#1a1a1a",
  onAccent: "#ffffff",
  radius: 10,
  maxWidth: 560,
  ctaLabel: "Payer avec SumUp",
  trustText:
    "Paiement sécurisé par SumUp. Aucune donnée bancaire ne transite par cette boutique.",
  showTrust: true,
  legalText: "",
  legalUrl: "",
};

export const DEFAULT_BUTTON_APPEARANCE = {
  label: "Payer avec SumUp",
  loadingLabel: "Redirection…",
  fullWidth: true,
  accent: "#1a1a1a",
  onAccent: "#ffffff",
  radius: 10,
  showTrust: true,
  trustText: "Paiement sécurisé par SumUp",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose: 6–20 digits once separators are stripped, optional leading +.
const PHONE_RE = /^\+?[0-9]{6,20}$/;

/** Coerce any value to a known field level, falling back to `fallback`. */
export const normalizeLevel = (value, fallback = "disabled") =>
  FIELD_LEVELS.includes(value) ? value : fallback;

const normalizeBillingMode = (value, fallback = "disabled") =>
  BILLING_MODES.includes(value) ? value : fallback;

/**
 * The effective, server-authoritative checkout config.
 * @param {object} settings a MerchantSettings row (or {})
 */
export function resolveCheckoutConfig(settings = {}) {
  const presetKey = PRESETS[settings.checkoutPreset]
    ? settings.checkoutPreset
    : "digital";
  const base = clone(PRESETS[presetKey]);

  const overrides =
    settings.checkoutFieldConfig && typeof settings.checkoutFieldConfig === "object"
      ? settings.checkoutFieldConfig
      : {};

  const fields = { ...base.fields };
  const fieldOverrides = overrides.fields || {};
  for (const key of CONTACT_FIELDS) {
    if (fieldOverrides[key] !== undefined) {
      fields[key] = normalizeLevel(fieldOverrides[key], fields[key]);
    }
  }
  // Email is non-negotiable.
  fields.email = "required";

  let shippingAddress = normalizeLevel(
    overrides.shippingAddress ?? base.shippingAddress,
    base.shippingAddress,
  );
  let billingAddress = normalizeBillingMode(
    overrides.billingAddress ?? base.billingAddress,
    base.billingAddress,
  );

  // `shippingEnabled` is the single master switch for the delivery module
  // (§8). The preset's `shipping` flag is only an admin-UI default hint.
  const shipping = Boolean(settings.shippingEnabled);

  // Delivery needs a shipping address to compute rates against.
  if (shipping && shippingAddress === "disabled") shippingAddress = "required";

  const appearance = { ...DEFAULT_APPEARANCE, ...sanitizeObject(settings.checkoutAppearance) };
  const buttonAppearance = {
    ...DEFAULT_BUTTON_APPEARANCE,
    ...sanitizeObject(settings.buttonAppearance),
  };

  return {
    preset: presetKey,
    advancedCheckoutEnabled: Boolean(settings.advancedCheckoutEnabled),
    shippingEnabled: Boolean(settings.shippingEnabled),
    fields,
    shippingAddress,
    billingAddress,
    shipping,
    appearance,
    buttonAppearance,
  };
}

function sanitizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export const isFieldVisible = (config, field) =>
  field === "email" || config.fields[field] !== "disabled";

export const isFieldRequired = (config, field) =>
  field === "email" || config.fields[field] === "required";

/* -------------------------------------------------------------------------- */
/* Validation — used identically on the client and the server.                */
/* -------------------------------------------------------------------------- */

const str = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * Validate the contact section against the effective config.
 * @returns {{ ok: boolean, errors: Record<string,string>, values: object }}
 */
export function validateContact(input = {}, config) {
  const errors = {};
  const values = {};

  const email = str(input.email);
  if (!email || !EMAIL_RE.test(email)) {
    errors.email = "Adresse e-mail invalide.";
  } else {
    values.email = email;
  }

  for (const field of ["firstName", "lastName", "company"]) {
    if (!isFieldVisible(config, field)) continue;
    const v = str(input[field]);
    if (!v && isFieldRequired(config, field)) {
      errors[field] = "Ce champ est obligatoire.";
    } else if (v.length > 120) {
      errors[field] = "Ce champ est trop long.";
    } else if (v) {
      values[field] = v;
    }
  }

  if (isFieldVisible(config, "phone")) {
    const raw = str(input.phone);
    const compact = raw.replace(/[\s().-]/g, "");
    if (!raw && isFieldRequired(config, "phone")) {
      errors.phone = "Le numéro de téléphone est obligatoire.";
    } else if (raw && !PHONE_RE.test(compact)) {
      errors.phone = "Numéro de téléphone invalide.";
    } else if (raw) {
      values.phone = raw;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, values };
}

/**
 * Validate one address block.
 * @param {object} input
 * @param {"disabled"|"optional"|"required"} level
 * @param {string} prefix error-key prefix ("shipping" | "billing")
 */
export function validateAddress(input = {}, level = "disabled", prefix = "shipping") {
  if (level === "disabled") return { ok: true, errors: {}, values: null };

  const errors = {};
  const a = {
    firstName: str(input.firstName),
    lastName: str(input.lastName),
    company: str(input.company),
    address1: str(input.address1),
    address2: str(input.address2),
    zip: str(input.zip),
    city: str(input.city),
    province: str(input.province),
    provinceCode: str(input.provinceCode),
    country: str(input.country),
    countryCode: str(input.countryCode).toUpperCase(),
    phone: str(input.phone),
  };

  const anyFilled = Object.values(a).some(Boolean);
  // An optional address left entirely blank is fine.
  if (level === "optional" && !anyFilled) {
    return { ok: true, errors: {}, values: null };
  }

  const requiredKeys = ["firstName", "lastName", "address1", "zip", "city", "countryCode"];
  for (const key of requiredKeys) {
    if (!a[key]) errors[`${prefix}.${key}`] = "Ce champ est obligatoire.";
  }

  if (a.countryCode && !/^[A-Z]{2}$/.test(a.countryCode)) {
    errors[`${prefix}.countryCode`] = "Pays invalide.";
  }
  if (
    a.countryCode &&
    PROVINCE_REQUIRED.has(a.countryCode) &&
    !a.province &&
    !a.provinceCode
  ) {
    errors[`${prefix}.province`] = "La région / province est obligatoire pour ce pays.";
  }
  if (a.phone) {
    const compact = a.phone.replace(/[\s().-]/g, "");
    if (!PHONE_RE.test(compact)) errors[`${prefix}.phone`] = "Numéro de téléphone invalide.";
  }
  for (const [k, v] of Object.entries(a)) {
    if (v && v.length > 255) errors[`${prefix}.${k}`] = "Ce champ est trop long.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values: Object.keys(errors).length === 0 ? a : null,
  };
}
