# Whool Vint beta

Independent Vercel project `whool-vint`, root `apps/vint`. Whool Com remains on its existing project and branch. The Vint branch is `feature/whool-vint-beta`.

## Data boundary

`vint_private` stores curated secondhand listings and change observations. No write or publication route reaches `public.products`. Shared `brand_pipeline` is read only; active/testing brands are required at write and read time. This beta does not activate new brands. H&M is excluded and parked brands remain parked.

The initial import contains 25 real product observations across Vinted, Tradera, Inimini, Glam Up Kids and Barnens Budget. At validation, 18 are displayable and seven remain held. Critical ambiguities are held. The public beta reads ready, available observations younger than 24 hours and hides elapsed Tradera auctions. It never assumes a complete marketplace catalogue.

## Runtime

Vercel `/api/catalogue` sends its own scoped gateway key to the Supabase Edge Function `whool-vint`. The key is a Vercel sensitive environment variable; only its SHA256 hash is stored in `vint_private.gateway_keys`. The Edge Function uses its built-in service identity internally. No service key or gateway key reaches browser assets.

The gateway exposes authenticated GET only. Each request reads the isolated catalogue and may claim one due source refresh in the background. Each source has a one-hour cooldown and a two-minute lease. It refreshes at most eight pre-registered exact product URLs, with 1.1 second spacing, no redirects, timeouts, body-size checks and no discovery or source registration. 403/429 pauses that source. A failed refresh cannot silently mark a product sold; stale records disappear after 24 hours. The next user request triggers refresh when due; there is no new unattended crawler or scheduled brand addition.

`verify_jwt=false` is intentional: the function authenticates the separate Vint gateway key before any data access. Database RPCs are service-only SECURITY INVOKER functions with explicit grants and an empty search path. All private tables use RLS. Service-role catalogue write permissions remain revoked by the existing Com setup.

## Product interpretation

The parser preserves source evidence and never executes React/Next script content. Tradera matches the exact itemId and keeps opening bid, Buy Now, fee and shipping separate. Vinted accepts only explicitly verified SEK offers. Inimini's generic NewCondition template is overridden by the product-specific secondhand grade with a logged conflict. Material-guide examples do not become product composition. Shopify retailer-as-brand fields are corrected only when an approved brand is explicit in that product title. Missing condition remains visible as unknown. Mixed size/underwear bundles, missing or estimated sizes and foreign-currency prices stay held. Product-specific size defects override a seemingly exact title.

Vintage is the name of the experience, not a claim that each garment is historically vintage. Product age and authenticity are unverified. Public display is a limited private prototype, not a claim of partnership with any source. Ongoing commercial reuse of merchant content needs its own agreed scope.

## UI

Shared Whool palette, system typography, Georgia logo, star, rounded controls, product cards and spacing. Vint adds warm cream, muted rust and an italic headline. Search and filters work locally. Favorites store only listing UUIDs under `whool-vint-favorites-v1`; no Com state or customer profile is accessed. Purchase buttons open original listings, without bids, orders, reservations or a simulated checkout.

## Development and validation

Run `npm test` and `npm run build` from `apps/vint`. The local preview can use an ignored `.env.local` with the new gateway key; never commit it. Database setup is in `schema.sql`, and the gateway bundle contains `index.ts`, `deno.json`, `parser.js` and `flight.js`. Apply schema before configuring the sources, seed observations and gateway hash. Seed data and secrets are deliberately not included in source.

Validation: nine Vint tests, the existing 89 regression tests, source checks and the Vint build pass. The deployed Vercel catalogue proxy returned HTTP 200; the updated authenticated Edge gateway returns 18 items across five sources. An actual bounded Inimini refresh completed successfully without touching the main 4,306 products. UI interactions were verified against a separate preview using a captured real catalogue response; a full production-browser check is limited by unchanged Vercel SSO protection.
