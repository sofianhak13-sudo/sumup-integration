-- AlterTable: additive discount / audit fields for the SumUp cart payment flow
ALTER TABLE "SumUpCartPayment" ADD COLUMN "subtotalAmount" DOUBLE PRECISION;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "discountCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SumUpCartPayment" ADD COLUMN "cartToken" TEXT;
ALTER TABLE "SumUpCartPayment" ADD COLUMN "snapshot" JSONB;
