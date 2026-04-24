# LWT Theme – Design System & Customization Guide

## Labels and tags (conventions)

- **Filter/facet labels** – Use locale: `products.facets.filter_by_label` ("Filter by"), `products.facets.tags_label` ("Tags"), `products.facets.product_type_label` ("Product type"), `products.facets.vendor_label` ("Vendor").
- **Section schema** – Use clear, consistent labels in Theme Editor:
  - **Links**: "Link URL" for URL fields, "Link label" or "Link text" for visible text.
  - **Buttons**: "Primary button label", "Primary button URL", "Secondary button label", "Secondary button URL".
  - **Content**: "Heading", "Paragraph text", "Icon image".
- **Accessibility** – Carousels/sliders use `accessibility.previous_slide`, `accessibility.next_slide`, `accessibility.go_to_slide` for aria-labels where possible.

---

## Bug fixes and improvements (audit)

- **Search type filter (main-search.liquid)**  
  Shopify Liquid does not expose URL query parameters (`request.get` does not exist). The “Filter by type” (All / Products / Pages / Articles) active state is now inferred from the search results: when all results share the same `object_type`, that type is shown as active.

- **Search type preserved when using facets**  
  A small script on the search page adds a hidden `type` input to the facet filter form when the URL has `?type=product`, `type=page`, or `type=article`, so changing product filters (e.g. price) does not drop the type filter.

- **Dead code removed (main-search.liquid)**  
  Removed the unused `product_settings` capture that referenced non-existent schema setting `product_show_vendor`. The section only uses `show_vendor`, which is correct.

- **Footer design-system selector**  
  Footer block heading styles no longer depend on `.color-scheme-1`, so they apply regardless of which color scheme the footer uses.

---

## Sections in use & health

This section summarizes which theme sections are used where and what has been fixed or improved so they work properly.

### Layout (global)

- **Header** – `sections/header-group.json` includes **announcement-bar** (e.g. “Free Shipping Orders over $150”) and **header** (logo, menu). Apps block can be present.
- **Footer** – `sections/footer-group.json` includes **_blocks** (Luxury footer: about, quick links, contact, newsletter, blog preview). Footer content is edited in **Theme Editor → Footer**.

### Section types used by template

| Section type | Used in | Notes |
|--------------|---------|--------|
| **image-banner** | Index, Contact, Services, Consults, Mission, Article, Collection (featured-brand, by-brand), many pages | Hero/banner; check heading, buttons, and `show_text_box` per template. |
| **quick-links** | Index | Consults, Wellness Shop, Training entry points. |
| **about-intro-card** | Index | “Serving Since 1999”, Our Story. |
| **main-blog** | Blog, blog.home-blog | Article grid; enabled and first on blog templates. |
| **featured-carousel** | Blog (home-blog) | Renders current blog articles; has Liquid content. |
| **featured-blog** | Index | “From Our Blog”; blog = news in template. |
| **contact-form** | (Theme section; can be added to any page) | Standard Shopify contact form. |
| **main-page** | Contact, Landing, etc. | Page title + `page.content`; often disabled when custom sections are used. |
| **main-product** | Product | Product form, price, buy buttons; cross-link-cta and related-products below. |
| **main-collection-banner** | Collection templates | Often **disabled**; slideshow used instead for hero. |
| **main-collection-product-grid** | Collection (by-brand, etc.), default collection | Default collection template has it disabled; product grid comes from _blocks (e.g. luxury product grid). |
| **slideshow** | Collection templates (bundles, desbio, immune-support, lights, omega, default) | First slide “Catalog home page” / “Home” link fixed to **Wellness products** where it was empty. |
| **cross-link-cta** | Product, Collection, Consults | “Not sure? Book a consult” / “Shop Wellness”; **link_url** has fallbacks in section Liquid when blank. |
| **CTA-Product-Row** | Index | Best Sellers row; enabled; links to Wellness products. |
| **_blocks** | Index, Blog, Contact, Collection, Article variants, Footer, etc. | Renders AI/custom blocks (e.g. ai_gen_block_* from `blocks/*.liquid`). Block types must exist in `blocks/`. |

### Fixes applied (sections working properly)

- **Collection slideshow “Catalog home page” link** – In `collection.json`, `collection.desbio.json`, `collection.immune-support.json`, and `collection.lights-collection.json`, the first slide had `"link":""`. It is now set to **Wellness products** (`shopify://pages/wellness-products`) so the button works.
- **Cross-link CTA** – Section uses fallback URLs when `link_url` is blank (consult → booking URL, retail → wellness-products). Product/collection templates can leave link_url empty; section still works.
- **Featured carousel** – Has Liquid output; uses current blog; safe when `blog` is blank.
- **Main blog / Featured blog** – Main blog enabled and first on blog templates; featured blog has blog = news on index.
- **Homepage CTAs** – Product row and Bundles “View all” / “Shop Collection” links fixed earlier; Best Sellers row enabled.

### Disabled sections (intentional or optional)

Many templates have **disabled** sections (banner, slideshow, rich-text, product-grid, main-page, or individual blocks). Disabling is used to hide default content in favor of custom _blocks or other sections. Re-enable in Theme Editor if you want the default section to show.

### List collections

- **list-collections.json** – Uses **main-list-collections** (grid of all collections). The **collection-list** sections are disabled and have empty collection picks; the page relies on main-list-collections. To show a curated list, enable one collection-list and set each block’s **Collection** in Theme Editor.

---

## Design system (look and feel)

All brand colors, spacing, and typography live in **`assets/design-system.css`**. Custom sections use these CSS variables so the site stays consistent.

### Main variables

| Variable | Use |
|----------|-----|
| `--lwt-primary` | Primary purple (#4b3f82) – buttons, links, accents |
| `--lwt-primary-dark` | Hover / emphasis |
| `--lwt-surface` | Light purple-tinted background (#f8f5ff) |
| `--lwt-section-padding-y` | Vertical padding for sections |
| `--lwt-content-max-width` | Max width for content (1200px) |
| `--lwt-radius-card` | Card border radius (20px) |
| `--lwt-radius-button` | Button border radius (40px) |
| `--lwt-shadow-card` / `--lwt-shadow-card-hover` | Card shadows (layered depth) |
| `--lwt-shadow-button` / `--lwt-shadow-button-hover` | Primary button shadow and hover |
| `--lwt-shadow-focus` | Focus ring (accessibility) |

### About Intro Card (homepage)

The **About Intro Card** section (`sections/about-intro-card.liquid`) supports:

- **Eyebrow / tagline** – Optional line above the heading (e.g. “Trusted in Functional Medicine”).
- **Accent bar** – Purple bar on the left (desktop) or top (mobile); toggle in **Show accent bar**.
- **Link as button** – “Learn About Us” can be a primary-style button or an underlined link.
- **Logo** – Logo alt text (accessibility), logo width (desktop).
- **Typography** – Eyebrow, heading, and paragraph font/size/weight/line-height; link/button colors.

Edit in **Theme Editor → Homepage → About Intro Card**. Leave **Eyebrow / tagline** blank to hide it.

---

### Visit icons (Quick Links)

Theme-provided icons for the Quick Links section (Consults, Wellness Shop, Training) live in **`assets/`**:

- **`lwt-icon-consults.png`** – Consults / wellness consultation
- **`lwt-icon-wellness-shop.png`** – Wellness Shop / supplements
- **`lwt-icon-training.png`** – Training / education

In **Theme Editor → Homepage → Quick Links Grid**, each block has **Visit icon**: choose **Consults**, **Wellness Shop**, or **Training** to use these; choose **Custom** to use an uploaded image instead.

---

### Utility classes

- **`.lwt-section`** – Section container with consistent padding and max-width.
- **`.lwt-card`** – Card-style block (background, shadow, border, hover lift).
- **`.lwt-button-primary`** – Primary button (shadow, hover lift, focus ring).

Cards and primary buttons use subtle hover states (shadow + lift) and focus-visible outlines for accessibility. Headings use slight negative letter-spacing for a cleaner look.

---

## Navigation and footer

- **Header**: Styling is in `design-system.css` (link hover, padding). Menu and logo are controlled in **Theme Editor → Header**.
- **Footer**: Link hover and spacing use the design system. Footer blocks (menus, newsletter, brand) are edited in **Theme Editor → Footer**.

---

## Homepage layout (services + retail + blog)

The homepage is ordered for a **high-converting flow**: **hero → services & retail entry → about/trust → services CTA → social proof (testimonials) → retail (products/collections) → blog**.

### Current order (after implementation)

| Order | Section | Purpose |
|-------|---------|---------|
| 1 | Image banner | Hero: “Real Wellness. Real Results.” + Book A Session / Shop Wellness (text box on for readability) |
| 2 | Quick Links | Entry: Consults, Wellness Shop, Training |
| 3 | (Ticker – disabled) | Optional announcement bar |
| 4 | About Intro Card | Trust: “Serving Since 1999”, Our Story |
| 5 | Transform CTA block | Primary CTA: “Start Your Journey” / Learn More |
| 6 | **Testimonials** | **Social proof right after CTA: “What Our Patients Say”** |
| 7 | Apps | App embeds |
| 8 | **Best Sellers Row** | **Retail: 3 products + “Shop Now” → Wellness products** |
| 9 | Product row (supplements) | Retail: D3, NAD, Cal-Mag + “View all products” → Wellness products |
| 10 | Bundles collection | “Complete Wellness Solutions” + “Shop Collection” → Bundles |
| 11 | Product row (light therapy) | TheraLumen, Ultra 360, LED + “View all products” → Advanced Light Devices |
| 12 | Collection Ticker | “Featured Products” (Biobotanical) |
| 13 | **Featured blog** | **“From Our Blog” – blog = news (articles shown)** |
| 14+ | (Disabled / empty) | Promo, collection spotlight, etc. |

To change this flow, use **Theme Editor → Homepage** and drag sections. Featured blog uses **Blog = news** in template; you can change it in the section settings.

### Debug & high-conversion fixes (shop home page)

- **Broken CTAs fixed:** Product row “View all products” and Bundles “Shop Collection” had empty links; they now point to **Wellness products** (`/pages/wellness-products`), **Bundles** (`/collections/bundles`), and **Advanced Light Devices** (`/collections/advanced-light-devices`) as appropriate.
- **Best Sellers row enabled:** The first product row (Best Sellers) is no longer disabled so visitors see shop content and a working “Shop Now” CTA.
- **Featured blog:** Blog handle **news** is set in the template so “From Our Blog” shows real articles; change in Theme Editor if you use a different blog.
- **Section order:** Testimonials were moved to **immediately after** the Transform CTA so social proof appears before product rows (trust → then shop).
- **Hero:** Text box and light overlay are on for better readability of headline and CTAs.

---

## Blog / News page

The blog listing and “News & Events” experience are fixed and consistent with the design system.

### Main blog template (`blog.json`)

- **Main blog** section is **enabled** and **first** in the section order so the article grid shows at the top.
- Article cards use design-system styling: `--lwt-radius-card`, `--lwt-shadow-card`, and hover shadow in **`assets/design-system.css`** (see “Main blog” and “Featured carousel” blocks).

### Blog alternate template (`blog.home-blog.json`)

- Uses only **existing** sections: **Main blog** (article grid) and **Featured carousel** (featured posts).
- Non-existent sections **blog-hero** and **blog-teaser** were removed to prevent missing-section errors.
- Section order: **Main blog** first, then **Featured carousel** (heading “News & Events”, configurable in Theme Editor).

### Featured carousel section (`sections/featured-carousel.liquid`)

- **Liquid content added**: section now renders articles from the **current blog** (`blog.articles`) in a grid (heading, “View all” link, post limit, columns, show image/date/author).
- Safe when used outside a blog template: if `blog` is blank, it shows nothing instead of erroring.
- Styling: same card radius and shadows as main blog for consistency.

To edit the blog page layout or featured block, use **Theme Editor → Blog** (or the blog that uses the “Home blog” template) and adjust **Main blog** and **Featured carousel** settings (heading, post limit, columns, padding).

---

## Contact page

The contact page template (`page.contact.json`) is improved for clarity and conversion.

### Layout and order

- **Hero banner** – An image banner at the top with heading “Contact Us” and short subtext so visitors see the purpose of the page immediately.
- **Section order**: Banner → **Contact form** → **Quick-action cards** (Book, Home, Shop) → **FAQ** (Shipping, Returns, Tracking, Consultations, Consult prep). The form appears first so users can send a message without scrolling; quick links and FAQ follow.

### Quick-action cards (three cards)

- **Book Now** – Links to the wellness booking portal: `https://portal.livingwelltoday.co/widget/bookings/lwt-wellness-check-in`.
- **Visit Homepage** – Links to `/` (storefront home).
- **Shop Now** (Wellness Shop) – Links to the Wellness products page (`shopify://pages/wellness-products`). Card title/description updated to “Wellness Shop” and “Browse supplements, protocols, and wellness products.”

Edit these links in **Theme Editor → Contact page** → the “Luxury CTA cards” block (card 1/2/3 button link).

### Design system

- **`design-system.css`** applies card radius and shadows to the three CTA cards, and focus-visible styles to the contact form inputs and submit button so the contact page matches the rest of the theme.

To change the banner image or text, use **Theme Editor → Contact page** → **Contact banner** (image-banner section). To edit the form fields or FAQ content, use the corresponding **_blocks** sections in the sidebar.

---

## Product full page

The **product full** template (`product.product-full.json`) and section (`sections/product-full.liquid`) provide a dedicated full-width product layout with gallery, description, price, Subscribe & Save, Add to Cart / Buy Now, and accordion blocks.

### Template layout

- **main** – Product full section (gallery + info, variant picker when product has multiple variants, price, subscription options, qty, Add to Cart, Buy Now, accordion).
- **Trust section** – “We provide best customer experience” with four trust items (Authentic, Factory-Sealed, GMP, Practitioner-Selected).
- **Cross-link CTA** – “Not sure what you need? Book a consult” (added; uses fallback booking URL when link_url is blank).
- **Recently viewed** – Section `recently-viewed-products`: shows products the customer has recently viewed (stored in `localStorage`; product-full pushes the current product handle on each visit). Heading and count configurable in Theme Editor.
- **Related products** – “You may also like” (Shopify product recommendations).
- **Suggested for you** – Second related-products section with heading “Suggested for you” (Shopify recommendations).
- **Featured collection simple** – Disabled; optional “Trending Now” ticker.
- **_blocks** – Optional collection ticker, layout, product ticker, etc.

### Section improvements (product-full.liquid)

- **Variant picker** – When the product has multiple variants (`product.has_only_default_variant` is false), a **Variant** dropdown is shown so customers can select size/option. On change, the section updates: selected variant id, price/compare-at/savings, stock badge, main gallery image (if the variant has a featured image), Add to Cart / Buy Now disabled state, and Subscribe & Save prices. A `variant:change` event is dispatched for any theme listeners.
- **Accordion** – Section has accordion blocks (title + content). Add or edit them in **Theme Editor → Product page (full)** → **Product full** → Add block “Accordion Item”.
- **Subscribe & Save** – Shown when the product has selling plan groups; one-time vs subscription options with correct price/savings.
- **Collapsible description** – Uses `product.metafields.custom.short_description` or `product.description`; “Read more” / “Read less” when content is long.

### Page template (page.product.full.liquid)

- **page.product.full.liquid** is a *page* template (not a product template). It includes only the product-full section. Pages do not have a `product` object, so this template is only useful if used with an app that provides product context or for a custom page layout. To use the full product layout for *products*, assign the **product.product-full** template to products in Shopify Admin (Products → [product] → Theme template → “product full”).

### Product description and paragraph spacing

- **Where to edit:** Product description is edited in **Shopify Admin → Products → [product] → Description**. Use the rich text editor: add line breaks or use “Paragraph” so the theme can apply spacing. Lists (bullets, numbers) and headings (H3, H4) are also spaced for readability.
- **Product full template:** The description is shown with HTML preserved (paragraphs, lists, headings). Use **Theme Editor → Product page (full) → Product full** → **Description paragraph spacing** to choose:
  - **Compact** – Tighter space between paragraphs.
  - **Relaxed** – Default; comfortable reading.
  - **Spacious** – More space between paragraphs and headings.
- **Default product template:** Description uses the same `.rte` paragraph spacing from `design-system.css` (no separate setting).

### Design system

- Product full section uses brand colors (#4B3F82, #211542, etc.) inline. For global consistency you can override with design-system variables in `design-system.css` (e.g. `.product-full-section .pf-add` using `--lwt-primary`).

To edit trust copy, accordion items, related products count, recently viewed heading/count, or suggested products, use **Theme Editor** → open a product that uses the “product full” template → adjust **Trust Card Section**, **Product full** (accordion blocks), **Recently viewed**, **You may also like**, and **Suggested for you** in the sidebar.

---

## Funneling: Consult vs Retail

The site supports **two main paths**: **Consult** (book a session, wellness consultation) and **Retail** (Wellness Shop, supplements, products). Funneling is present but not a single “choose your path” step — both paths are offered in parallel.

### Consult funnel (services)

| Where | CTA | Destination |
|-------|-----|-------------|
| **Hero** | “Book A Session” (primary) | Booking portal (lwt-wellness-check-in) |
| **Hero** | “Talk to US” (secondary) | Contact page |
| **Quick Links** | “Consults” | Bio-feedback wellness consult page |
| **Transform block** | “Start Your Journey” (primary) | Booking portal |
| **Transform block** | “Learn More!” (secondary) | Bio-feedback wellness consult page |

Consult-focused pages (e.g. **Consults** template) also offer “Book A Session” and often “Wellness Shop” for cross-path.

### Retail funnel (shop)

| Where | CTA | Destination |
|-------|-----|-------------|
| **Quick Links** | “Wellness Shop” | Wellness products page |
| **Product rows** | “View all products” | Wellness products / collections |
| **Bundles section** | “Shop Collection” / “Add to Cart” | Bundles collection |
| **Collection Ticker** | “View All Products” | Featured collection / all products |

The **hero has no “Shop” button** — only Book + Contact. Retail entry is via Quick Links and product sections below.

### Fix applied

- **Transform block** “Start Your Journey” had an empty `primary_button_link`; it now points to the same booking URL as the hero (“Book A Session”) so the main services CTA works.

### Implemented improvements

- **Hero**: Second button is now **“Shop Wellness”** (links to Wellness products) so both **Book A Session** and **Shop Wellness** are above the fold. Contact remains in the menu/footer.
- **Cross-link CTA**: Section **Cross-link CTA** (`sections/cross-link-cta.liquid`) with two styles:
  - **Consult** – “Not sure what you need?” + “Book a consult” (use on product/collection pages). Added to **product** and **collection** templates.
  - **Retail** – “Or browse the shop” + “Shop Wellness” (use on consult page). Added to **Consults** page template.
- **Menu**: Add **Book** (or Consults) and **Wellness Shop** (or Shop) in **Online Store → Navigation** (see below).

### Menu setup (Book + Shop + Contact)

The header uses the menu assigned in **Theme Editor → Header** (e.g. **new-menu**). To funnel clearly:

1. Go to **Shopify Admin → Online Store → Navigation**.
2. Open the menu used by the header (e.g. **Main menu** or **new-menu**).
3. Add or edit items so you have:
   - **Book** (or **Consults**) → link to your booking URL or `/pages/bio-feed-back-wellness-consult`.
   - **Wellness Shop** (or **Shop**) → link to `/pages/wellness-products` or your main shop collection.
   - **Contact** → link to `/pages/contact-us` (optional; hero no longer has “Talk to US”).
   - **Our Story** → link to `/pages/about-us` (optional).

Edit hero and Transform block links in **Theme Editor → Homepage** (Image banner and the Transform/“Start Your Journey” section).

**Cross-link CTA section**: To add “Not sure? Book a consult” or “Browse the shop” to another template, use **Theme Editor** → open that template → **Add section** → **Cross-link CTA (Consult)** or **Cross-link CTA (Retail)**. Edit heading, button text, and URL in the section settings.

---

## Services page (high-converting)

The **Services** page (`page.services.json`) is built for conversion:

- **Hero**: "Empowering Your Wellness Journey" + subtext + **Book a Consult** (primary) and **Meet the Team** (secondary).
- **Trust card**: "Trusted Wellness, Personalized Care…" + **Book a Consult** (links to booking).
- **Consultant cards** (new section): Two practitioners with photo, name, credentials, expertise, pricing line, and **Book with [Name]** CTA. Edit in **Theme Editor → Pages → Services** → "Choose Your Practitioner" section. Add consultant photos and adjust expertise/pricing per block.
- **Consultations** (clickable columns): Wellness Consults, Focus Forward, 100-Day Intensive—each links to the consult page with clearer copy.
- **Book consult CTA**: "Ready to Take the First Step…" + Book Now + **Meet Our Team** (links to meet-our-team).
- **Meet the experts banner**: **Meet the Team** (links to meet-our-team).

Design system: Consultant cards use `--lwt-*` variables; trust card, clickable columns, and meet-experts use design-system border radius and shadows for a consistent feel.

---

## Our Story page – full layout review

The **Our Story** page appears in the menu as **“Our Story”** and lives at `/pages/about-us`. It’s linked from the homepage (“Our Story” / “Learn About Us”), Training & Education (“Who We Are!”), and other CTAs. Its layout depends on which **page template** is assigned in Shopify Admin (**Online Store → Pages → [Our Story / about-us] → Theme template**).

### Option A: Default template (`page`)

If the Our Story page uses the **default** template (`page.json`):

| Order | Section | Content |
|-------|---------|---------|
| 1 | **main-page** | Page title (from Admin) + **page content** (rich text from **Online Store → Pages → About Us → Content**). Narrow column, standard padding. |

- **Edit content**: **Shopify Admin → Online Store → Pages** → open the page titled **Our Story** (handle: about-us) (title and body).
- **Edit padding**: **Theme Editor → Pages → Default page** → Main page section.

No hero, no mission/vision, no team or trust blocks—only the title and whatever you write in the page body.

---

### Option B: Mission template (`page.mission`)

If the Our Story page uses the **Mission** template (`page.mission.json`), the layout is section-based. Below is the **full section order** and what is **visible** vs **disabled** as of the current theme.

#### Section order (top to bottom)

| # | Section ID | Type | Status | Purpose |
|---|------------|------|--------|---------|
| 1 | image_banner_wTzFW9 | image-banner | **Visible** | Hero: “Empowering Wellness” + “Pioneering Functional Medicine…” + Book Session / Follow Us. |
| 2 | mission_vision_trust_hjJUbk | mission-vision-trust | Disabled | Logo + heading + Mission/Vision cards (alternate “Our Story” block). |
| 3 | 175617496407c4fe60 | _blocks (company bio) | **Visible** | **Our Story block**: tagline “Living well today”, “Elevating Wellness Through Innovation”, company description (established 1999, telehealth, etc.), **Our Purpose** / **Our Future** cards, stats (10K+ journeys, 40+ years, 100% Remote). |
| 4 | 17561706501cdd8f94 | _blocks (company story) | Disabled | Alternate company/story block. |
| 5 | trust_card_EFfEtT | trust-card | Disabled | “Welcome to Living Well Today” + CTA. |
| 6 | 1756179849e6c01293 | _blocks | Empty | — |
| 7 | meet_the_experts_banner_PNxUnC | meet-the-experts-banner | Disabled | “Real Experts. Real Care.” + Aaron & Mike image + CTA. |
| 8 | 17470194829781a8bf | apps | **Visible** | App embeds (if any). |
| 9 | book_consult_cta_KUCnWT | book-consult-cta | Disabled | “Ready to Take the First Step Toward Wellness?” CTA. |
| 10 | newsletter_cta_NkPaXj | newsletter-cta | Disabled | “Join Our Wellness Circle” signup. |
| 11 | main | main-page | Disabled | Default page title + content (not shown when disabled). |
| 12 | trust_section_dCbGY3 | trust-section | **Visible** | **Trust section**: logo + “Care you can trust. Results that count.” + subheading + 4 trust items (Licensed & Experienced, Root-Cause Approach, Non-Invasive Insights, Ongoing Support). |
| 13 | 1757466417e26e1b8e | _blocks (Meet the experts) | **Visible** | **Meet the experts**: “Real Wellness. Real Results.” + expert cards (Michael Payne, Aaron Payne, etc.) + Book a Session CTA. |
| 14 | 1756179400145bc945 | _blocks (reviews) | Disabled | Judge.me reviews carousel. |
| 15 | 175625308604503ee4 | _blocks (Luxury CTA) | **Visible** | **CTA cards**: Start Today (Book Now), Questions? (Contact Us), Shopping Page (Shop Now). |
| 16+ | 1758080082093e8c9f, empty _blocks, apps | — | Disabled / empty | — |

#### Visible flow (what visitors see)

1. **Hero (image-banner)** – “Empowering Wellness” + supporting line + Book Session / Follow Us.
2. **Our Story (company bio block)** – Brand tagline, “Elevating Wellness Through Innovation”, description (1999, telehealth, functional medicine), **Our Purpose** and **Our Future**, then stats (10K+ journeys, 40+ years, 100% Remote).
3. **Apps** – Any app widgets.
4. **Trust section** – “Care you can trust. Results that count.” + four trust pillars (Licensed & Experienced, Root-Cause Approach, Non-Invasive Insights, Ongoing Support).
5. **Meet the experts** – “Real Wellness. Real Results.” + expert cards (e.g. Michael Payne, Aaron Payne) + Book a Session.
6. **CTA cards** – Start Today (Book), Questions? (Contact), Shopping Page (Shop).

#### Where to edit (Mission template)

- **Hero**: Theme Editor → **Pages → Mission** → first Image banner section (heading, text, buttons, image).
- **Our Story block**: Same template → section **175617496407c4fe60** (company description, Our Purpose/Our Future, stats, colors, fonts).
- **Trust section**: Same template → “Trust Card Section” (heading, subheading, four trust items, logo, colors).
- **Meet the experts**: Same template → “Meet the experts” block (names, bios, images, CTA).
- **CTA cards**: Same template → “Luxury CTA cards” block (Start Today, Questions?, Shopping Page links and labels).

#### Summary

- **Default template**: Our Story is a simple title + body page. Best if you want a single, editable story in Admin.
- **Mission template**: Our Story becomes a full “Our Story” experience: hero → story (purpose/vision/stats) → trust → team → CTAs. Use this if the page is assigned the **Mission** theme template.

To assign or change the template: **Shopify Admin → Online Store → Pages** → open **Our Story** (handle: about-us) → **Theme template** → choose **page** (default) or **page.mission**. The **menu label** (“Our Story”) is set in **Online Store → Navigation** (e.g. Main menu).

---

## Sections: add, remove, reorder

- **Reorder homepage sections**: **Theme Editor → Homepage** → drag sections in the left sidebar.
- **Add a section**: Click “Add section” and pick one (e.g. Image with text, Collection list).
- **Remove a section**: Click the section → “Remove section”.
- **Redesign a section**: Edit the section’s Liquid file in `sections/` and use `--lwt-*` variables and `.lwt-section` / `.lwt-card` where it makes sense.

---

## Copy (headlines, CTAs, policies)

- **Headlines and CTAs**: Edit in **Theme Editor** on each template (Homepage, Collection, Product, etc.) or in the section settings (e.g. “Heading”, “Button label”).
- **Policies**: **Shopify Admin → Settings → Policies** (Refund, Privacy, Terms). The footer shows them if **Theme Editor → Footer** has “Show policy links” enabled.

---

## Product and collection presentation

- **Theme settings**: **Theme Editor → Theme settings** – card style, image padding, colors, badges.
- **Design system**: Product/collection cards use theme color schemes. For custom sections (e.g. CTA product rows), use `--lwt-primary`, `--lwt-surface`, and `--lwt-radius-card` so they match the rest of the site.

---

## Mobile behavior

- **design-system.css** includes mobile rules: smaller padding, 44px min touch targets for header/footer links, and responsive section padding.
- Test on real devices or Chrome DevTools device mode after changes.

---

## New pages or templates

- **New page**: **Shopify Admin → Online Store → Pages** → Add page → assign a template if needed.
- **New template**: Duplicate an existing template in `templates/` (e.g. `page.json` → `page.custom.json`), then assign it to a page in the admin.
- Use `.lwt-section` and `--lwt-*` variables on new templates so they match the design system.
