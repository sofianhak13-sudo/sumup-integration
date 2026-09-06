-- CreateTable
CREATE TABLE "MerchantSettings" (
    "shop" TEXT NOT NULL,
    "cartPaymentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cartDrawerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "hideShopifyCheckout" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantSettings_pkey" PRIMARY KEY ("shop")
);
