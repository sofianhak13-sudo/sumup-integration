-- Checkout V2 — additive only. No DROP, no rename, no NOT NULL without a
-- default. Existing rows keep the current "fast" behaviour.

-- MerchantSettings: checkout V2 config + SumUp merchant identity
ALTER TABLE "MerchantSettings" ADD COLUMN "advancedCheckoutEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MerchantSettings" ADD COLUMN "shippingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MerchantSettings" ADD COLUMN "checkoutPreset" TEXT NOT NULL DEFAULT 'digital';
ALTER TABLE "MerchantSettings" ADD COLUMN "checkoutFieldConfig" JSONB;
ALTER TABLE "MerchantSettings" ADD COLUMN "checkoutAppearance" JSONB;
ALTER TABLE "MerchantSettings" ADD COLUMN "buttonAppearance" JSONB;
ALTER TABLE "MerchantSettings" ADD COLUMN "sumupMerchantName" TEXT;
ALTER TABLE "MerchantSettings" ADD COLUMN "sumupMerchantEmail" TEXT;
ALTER TABLE "MerchantSettings" ADD COLUMN "sumupApiKeyLast4" TEXT;
ALTER TABLE "MerchantSettings" ADD COLUMN "sumupAccountStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "MerchantSettings" ADD COLUMN "sumupAccountCheckedAt" TIMESTAMP(3);

-- SumUpCartPayment: checkout V2 buyer / delivery data
ALTER TABLE "SumUpCartPayment" ADD COLUMN "checkoutMode" TEXT NOT NULL DEFAULT 'fast';
ALTER TABLE "SumUpCartPayment" ADD COLUMN "firstName" TEXT;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "lastName" TEXT;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "phone" TEXT;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "company" TEXT;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "shippingAddress" JSONB;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "billingAddress" JSONB;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "shippingMethod" JSONB;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "shippingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "checkoutSnapshot" JSONB;
