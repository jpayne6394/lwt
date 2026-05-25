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

Use structured feeds first. These public product feeds are built in, so you do not need to add Render env vars for them unless you want to override the URL:

```bash
SUPPLIER_FEED_URL_PHYSICIANS_STANDARD=https://www.physiciansstandard.com/products.json?limit=250
SUPPLIER_FEED_URL_DESBIO=https://desbio.com/wp-json/wc/store/v1/products?per_page=100
SUPPLIER_FEED_URL_RESEARCH_NUTRITIONALS=https://www.researchednutritionals.com/wp-json/wc/store/v1/products?per_page=100
```

Use website automation only when no feed/API exists:

```bash
SUPPLIER_WEBSITE_CONFIG_DESBIO={"loginUrl":"https://portal.example.com/login","productsUrl":"https://portal.example.com/products","selectors":{"username":"#email","password":"#password","submit":"button[type=submit]","productRows":"[data-product-row]"}}
SUPPLIER_USERNAME_DESBIO=portal-user
SUPPLIER_PASSWORD_DESBIO=portal-password
```

Physicians' Standard uses the `PHYSICIANS_STANDARD` environment suffix. Credentials can stay in Render for future authenticated cost/stock extraction, but the current public feed works without them:

```bash
SUPPLIER_USERNAME_PHYSICIANS_STANDARD=portal-user
SUPPLIER_PASSWORD_PHYSICIANS_STANDARD=portal-password
```

Research Nutritionals uses the `RESEARCH_NUTRITIONALS` suffix:

```bash
SUPPLIER_USERNAME_RESEARCH_NUTRITIONALS=portal-user
SUPPLIER_PASSWORD_RESEARCH_NUTRITIONALS=portal-password
```

Emerson Ecologics needs either an official feed/API URL or a known post-login catalog/export URL. Its login page uses bot protection, so credentials alone are not enough for reliable unattended automation:

```bash
SUPPLIER_COOKIE_EMERSON_ECOLOGICS=session-cookie-string
SUPPLIER_CATALOG_URLS_EMERSON_ECOLOGICS=https://www.emersonecologics.com/shop
SUPPLIER_WEBSITE_CONFIG_EMERSON_ECOLOGICS={"loginUrl":"https://emersonecologics.com/login","productsUrl":"https://emersonecologics.com/<post-login-catalog-or-export-url>","selectors":{"username":"#email","password":"#password","submit":"button[data-e2e=\"sign-in-button\"], button[type=submit]","productRows":"[data-product-row]"}}
SUPPLIER_USERNAME_EMERSON_ECOLOGICS=portal-user
SUPPLIER_PASSWORD_EMERSON_ECOLOGICS=portal-password
```

To avoid manually copying cookies from browser Inspect, run the local capture helper:

```bash
npm run capture:emerson
```

It opens Emerson in a real browser, lets you log in once, and writes `.auth/emerson-cookie.env` with the `SUPPLIER_COOKIE_EMERSON_ECOLOGICS` value to add in Render.

Website product rows should expose `data-*` fields such as `data-title`, `data-sku`, `data-upc`, `data-available`, `data-quantity`, `data-cost`, `data-msrp`, and `data-sale-price`.

## Shopify permissions

The app needs Shopify Admin API scopes for product and inventory automation:

- `read_products`
- `write_products`
- `read_inventory`
- `write_inventory`

The app UI is server-rendered and includes Shopify App Bridge so it can be embedded in Shopify admin.
