# Supplier Ops Agent

Embedded Shopify admin app and background worker for supplier-driven inventory and pricing automation.

## What v1 does

- Checks Emerson Ecologics, BioResource/Pekana, Systemic Formulas, Research Nutritionals, World Health Mall, DesBio, and Physicians' Standard through supplier adapters.
- Normalizes supplier stock, cost, MSRP/list price, sale price, SKU, UPC, product URL, and images.
- Matches products by manual mapping, exact SKU, exact UPC, then high-confidence vendor/title matching.
- Updates existing Shopify variants automatically, across active, draft, and archived products.
- Sets out-of-stock to `0`, in-stock without exact quantity to `10`, and exact supplier quantity when present.
- Uses supplier MSRP/list price first; otherwise falls back to `2x` cost. Supplier sales mirror into price plus compare-at price.
- Blocks uncertain matches, supplier failures, login/2FA problems, parser errors, and price swings over 25%.
- Creates newly discovered supplier products as Shopify drafts only.

## Run locally

This workspace did not have `npm` on PATH, so the included scripts use Node's built-in TypeScript stripping in Node 22+.

```bash
node --test --experimental-strip-types "tests/**/*.test.ts"
node --experimental-strip-types src/index.ts
node --experimental-strip-types src/worker.ts --dry-run
```

For production, install the declared dependencies with your package manager, create the Postgres schema from `src/storage/schema.sql`, set the environment variables from `.env.example`, and run `src/index.ts` behind your Shopify app URL.

## Supplier setup

Use structured feeds first:

```bash
SUPPLIER_FEED_URL_DESBIO=https://example.com/desbio-products.json
```

Use website automation only when no feed/API exists:

```bash
SUPPLIER_WEBSITE_CONFIG_DESBIO={"loginUrl":"https://portal.example.com/login","productsUrl":"https://portal.example.com/products","selectors":{"username":"#email","password":"#password","submit":"button[type=submit]","productRows":"[data-product-row]"}}
SUPPLIER_USERNAME_DESBIO=portal-user
SUPPLIER_PASSWORD_DESBIO=portal-password
```

Physicians' Standard uses the `PHYSICIANS_STANDARD` environment suffix:

```bash
SUPPLIER_FEED_URL_PHYSICIANS_STANDARD=https://example.com/physicians-standard-products.json
SUPPLIER_USERNAME_PHYSICIANS_STANDARD=portal-user
SUPPLIER_PASSWORD_PHYSICIANS_STANDARD=portal-password
```

Website product rows should expose `data-*` fields such as `data-title`, `data-sku`, `data-upc`, `data-available`, `data-quantity`, `data-cost`, `data-msrp`, and `data-sale-price`.

## Shopify permissions

The app needs Shopify Admin API scopes for product and inventory automation:

- `read_products`
- `write_products`
- `read_inventory`
- `write_inventory`

The app UI is server-rendered and includes Shopify App Bridge so it can be embedded in Shopify admin.
