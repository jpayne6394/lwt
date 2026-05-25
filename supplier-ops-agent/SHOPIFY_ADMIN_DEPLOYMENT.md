# Getting Supplier Ops Into Shopify Admin

The local app becomes available from any computer when it is installed as an embedded Shopify app and hosted at a public HTTPS URL.

## 1. Add the Shopify auth layer

Before production install, add Shopify app authorization and embedded-app session handling:

- OAuth or Shopify managed installation to get and store an offline Admin API access token for the store.
- App Bridge session-token verification for requests from the embedded admin iframe.
- App uninstall webhook handling so stored shop tokens are marked inactive if the app is removed.

The current app has the operational supplier sync engine and admin UI, but it still uses environment-based Shopify credentials. That is fine for local testing, not for a real installed app.

## 2. Deploy the web app

Deploy `supplier-ops-agent` to a cloud host that supports:

- Node 22+
- Public HTTPS URL
- Always-on background worker or scheduled job
- Postgres
- Environment variables and secrets
- Optional browser automation support for supplier portals

Good fits: Fly.io, Render, Railway, Google Cloud Run with Cloud Scheduler, or a small VPS.

Production environment variables:

```bash
APP_URL=https://supplier-ops.yourdomain.com
DATABASE_URL=postgres://...
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory,read_orders,read_content,write_content
SHOPIFY_SHOP=lwtinternational-com.myshopify.com
SHOPIFY_API_VERSION=2026-01
EMAIL_WEBHOOK_URL=...
```

Supplier credentials/feed URLs are configured per supplier, using the examples in `.env.example`.

## 3. Create the Shopify app

In Shopify Partner Dashboard or Dev Dashboard:

1. Create an app for this store.
2. Enable **Embed app in Shopify admin**.
3. Set the app URL to the deployed HTTPS URL.
4. Add redirect URLs:
   - `https://supplier-ops.yourdomain.com/auth/callback`
   - `https://supplier-ops.yourdomain.com/auth/shopify/callback` if the auth implementation uses that path
5. Add Admin API scopes:
   - `read_products`
   - `write_products`
   - `read_inventory`
   - `write_inventory`
   - `read_orders`
   - `read_content`
   - `write_content`
6. Save the generated API key/client ID and API secret into the deployed app environment.

## 4. Install and verify

1. Open the app install link for the target Shopify store.
2. Approve the requested scopes.
3. In Shopify admin, go to **Apps** and open **Supplier Ops Agent**.
4. Confirm the embedded app loads inside Shopify admin.
5. Run a dry-run supplier sync first.
6. Run **Refresh radar** in BI Analyst to generate the first revenue-play queue.
7. Configure supplier feeds, Market Radar source URLs, or portal credentials one supplier/source at a time.
8. Enable write-mode automation after each supplier passes a dry-run.

## 5. Operational defaults

- Weekly full sync runs on the deployed worker.
- The admin app exposes manual run-now.
- Existing products can update stock, cost, price, and compare-at price.
- New supplier items are created as drafts only.
- Price changes over 25%, uncertain matches, login/2FA, and parser failures are blocked and alerted.
- Blog articles are created as Shopify drafts only after approval.
- Campaigns are generated as Shopify Email handoff briefs; the app does not send email.
- Flow Launchpad links to Shopify Flow and tracks setup ideas; it does not auto-edit Flow workflows.

