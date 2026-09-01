HORIZON PREMIUM MULTISTORE — V1.2 FIXED

Base: V1 (the version that Shopify accepted for upload)

Fixes applied:
1. Corrected LE BON PLAN SumUp cart App Proxy endpoint:
   /apps/sumup-pay/cart -> /apps/sumup-pay.cart
2. Added missing snippets/cart-title.liquid dependency.
3. Added missing snippets/menu-featured-image.liquid dependency.
4. Preserved the existing Horizon structure and premium button/SumUp custom blocks.
5. No production credentials or backend secrets added.

Important:
- This package is intentionally based on V1 rather than V1.1 Ultimate, because V1.1 was reported as rejected by Shopify.
- Test first as an unpublished theme.
- A real SumUp payment should only be tested after confirming the App Proxy is installed/configured on the target shop.
