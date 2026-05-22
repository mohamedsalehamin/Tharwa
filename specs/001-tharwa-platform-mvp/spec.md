# Feature Specification: Tharwa (ثروة) — Platform MVP

**Feature Branch**: `[001-tharwa-platform-mvp]`

**Created**: 2026-05-12

**Status**: Draft

**Input**: User description: "Tharwa — consumer mobile product for Egyptian market context: track EGX equities, gold and silver, and foreign exchange versus EGP; internal-only admin for configuration and operations; three separate product repositories (backend, mobile, admin web) with no monorepo; backend is sole gateway to external market data; constitution v1.0.0 applies."

## Clarifications

### Session 2026-05-12

- Q: Consumer authentication model for MVP (anonymous vs accounts)? → A: Optional accounts — anyone may browse prices without an account; a signed-in consumer account is required for personal trade journaling, personal portfolio tracking, and other advanced consumer features; the free anonymous browsing tier includes Google AdMob advertising placements.
- Q: Include parallel/unofficial EGP alongside official in MVP? → A: **B** — MVP shows **official / central bank / agreed institutional** EGP FX streams only; parallel or unofficial "street" EGP rates are **out of scope for MVP** (may be added later under a separate spec amendment with mandatory distinct labeling from official streams).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See exchange metals and FX versus EGP (Priority: P1)

As a retail user, I open the mobile product and see a concise home summary plus dedicated areas for foreign exchange versus the Egyptian pound and for gold/silver prices relevant to me, with clear wording that this is informational (not trading advice) and with visible indication when data is delayed, approximate, or sourced from a named category (without exposing vendor secrets).

**Why this priority**: Delivers core value immediately and validates the full path from external market data through the controlled backend to the consumer.

**Independent Test**: With configured backend sources, a tester can verify home summary, FX list, and metals screens show consistent values and labels without using the administration product.

**Acceptance Scenarios**:

1. **Given** the backend has valid configuration for at least one FX source and one precious-metals source, **When** the user opens the home summary, **Then** they see at least the primary pairs agreed in scope (e.g. USD, EUR, SAR, AED, GBP versus EGP) or an explicit empty-state if the administrator disabled a pair.
2. **Given** the same configuration, **When** the user opens the metals area, **Then** they see gold and silver prices in units defined in requirements (e.g. per gram and per ounce) converted or displayed in EGP as specified, with karat breakdown for gold where specified.
3. **Given** a temporary upstream failure, **When** the user opens any of these screens, **Then** they see a user-friendly error or last-known values with visible staleness/freshness indication per requirements — never a silent blank critical field.
4. **Given** Arabic as the default locale, **When** the user uses the product, **Then** RTL layout and Arabic copy are correct for these screens; **When** they switch to English (if offered in MVP), **Then** LTR and English copy apply without layout breakage on the same screens.
5. **Given** an anonymous or signed-out user viewing free browsing screens (home, FX, metals, public equities list/detail), **When** those screens load successfully, **Then** the product shows AdMob-served placements that do not obscure mandatory disclaimers or primary price fields, and failed ad loads degrade gracefully without blocking market data.

---

### User Story 2 — Browse Egyptian equities (Priority: P2)

As a retail user, I browse a curated list of Egyptian listed equities, search or filter within the curated set, open a security detail view, and see current indicative values and a historical price chart for selectable periods, with the same transparency rules as Story 1 regarding delay and non-advisory nature.

**Why this priority**: Core differentiator for "Tharwa" but can ship after FX/metals if data integration is heavier; still a standalone slice once backend list and quotes exist.

**Independent Test**: With backend configured for a defined symbol set, a tester can verify list, detail, and chart without implementing Stories 3–5 (admin, watchlist, portfolio).

**Acceptance Scenarios**:

1. **Given** the administrator has published a non-empty curated symbol list, **When** the user opens the equities area, **Then** they see those symbols with current indicative price and day change (or equivalent fields defined for MVP).
2. **Given** a symbol in the curated list, **When** the user opens its detail, **Then** they see the same headline fields plus a chart for at least daily resolution spanning the periods defined for MVP (e.g. day / week / month / year).
3. **Given** the local cash equity market is closed, **When** the user views equities, **Then** they still see last session or last available values with clear session/closure semantics (no implication of live continuous auction unless true).
4. **Given** a symbol removed from the curated list, **When** a signed-in user who had it on their watchlist returns, **Then** they see a clear "no longer available" or redirect to list; **When** an anonymous user had only browsed that symbol (no account), **Then** deep links behave per standard empty/error handling without implying a saved watchlist.

---

### User Story 3 — Operate internal administration (Priority: P2)

As an internal administrator, I authenticate to the web administration product (not reachable from normal consumer flows), manage API credentials and connection settings for upstream providers, manage the curated equity symbol set and display order, manage which FX pairs and metal presentations appear to consumers, and view basic health indicators (e.g. last successful fetch per source) so I can recover from outages.

**Why this priority**: Required for safe operations and to avoid shipping mobile builds for every configuration change; can follow initial read-only MVP only if explicitly scoped — here assumed part of first delivery wave after or alongside P1 backend readiness.

**Independent Test**: With test credentials, an admin completes configuration changes and verifies consumer-visible data updates without deploying a new mobile binary for purely backend-driven list changes.

**Acceptance Scenarios**:

1. **Given** a valid admin session, **When** the administrator updates upstream credentials or toggles a source off, **Then** changes persist and the consumer product reflects allowed behavior (updated data, degraded mode, or error messaging) within the freshness SLA defined in Success Criteria.
2. **Given** a valid admin session, **When** the administrator edits the curated equity list or ordering, **Then** the mobile list reflects the change without requiring a mobile store release for list-only changes.
3. **Given** no valid admin session, **When** any actor attempts administration URLs or actions, **Then** access is denied and attempts are auditable per security requirements.
4. **Given** a valid admin session, **When** the administrator views health indicators, **Then** they see at minimum last success time per configured source and a distinguishable failure state.

---

### User Story 4 — Personal watchlist (Priority: P3)

As a **signed-in** consumer, I maintain a personal watchlist mixing instruments from FX, metals, and equities where allowed, reorder items, and remove them. Anonymous users do not get a persisted server watchlist in MVP (they may browse only).

**Why this priority**: Increases engagement after core price readouts; requires consumer identity and backend persistence.

**Independent Test**: With a test consumer account, watchlist CRUD works end-to-end without requiring admin configuration beyond normal source setup.

**Acceptance Scenarios**:

1. **Given** a signed-in consumer and at least one visible instrument, **When** they add it to the watchlist, **Then** it appears on the watchlist screen with current fields.
2. **Given** multiple watchlist items, **When** the user reorders them, **Then** the new order persists across app restarts.
3. **Given** a watchlist item, **When** the user removes it, **Then** it no longer appears and does not return unless re-added.
4. **Given** an anonymous user, **When** they attempt to save a watchlist entry, **Then** they are prompted to sign in or register before persistence succeeds.

---

### User Story 5 — Portfolio and trade journal (signed-in) (Priority: P3)

As a **signed-in** consumer, I record my own transactions (buy/sell notes, quantity, price, instrument) for personal tracking only, and view a personal portfolio summary derived from those records (e.g. P/L versus recorded cost basis). This is **not** broker execution or custody of funds.

**Why this priority**: Differentiates power users but depends on accounts and clear non-broker disclaimers.

**Independent Test**: With a test account, create journal entries and verify portfolio aggregates without any live order routing.

**Acceptance Scenarios**:

1. **Given** a signed-in consumer, **When** they add a journal transaction for a supported instrument, **Then** it is stored and reflected in their portfolio summary.
2. **Given** an anonymous user, **When** they open portfolio or trade journal flows, **Then** they are blocked until they sign in or register.
3. **Given** any user viewing portfolio or journal screens, **When** the screen renders, **Then** copy states that figures are self-reported tracking only, not executed trades or investment advice.

---

### Edge Cases

- Upstream rate limits or hard failures: consumer sees graceful degradation; admin sees actionable status.
- Clock skew or ambiguous "trading day" for EGX: headline fields and charts must not contradict each other without explanation.
- Very poor connectivity: cached display rules and explicit offline/stale indicators.
- Regulatory or copy risk: any disclaimer required for Egyptian retail context appears where mandated by product/legal review (exact text may be non-technical appendix).
- Admin misconfiguration (empty symbol list, invalid credentials): consumer experiences controlled empty states; admin sees validation errors.
- AdMob: no fill, policy violation, or offline ad SDK: market data and disclaimers remain usable; no infinite loading on primary price surfaces.
- User signs out: gated data (watchlist, portfolio, journal) must not remain visible on device beyond policy-defined retention without re-auth.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST present foreign exchange prices as major currencies versus EGP, scoped to the set the business configures for MVP (minimum USD; others as configured).
- **FR-002**: The product MUST present gold and silver prices with units and karat coverage for gold as defined for MVP, priced or converted for display in EGP per business rules.
- **FR-003**: The consumer mobile product MUST NOT call external market data providers directly; all such data MUST flow through the central backend described in the constitution.
- **FR-004**: Every consumer-facing quote or chart MUST carry or link to user-visible semantics for freshness, delay, or session (e.g. last close vs live), and MUST NOT present itself as guaranteed real-time unless that property is true by specification.
- **FR-005**: The product MUST include a clear, persistent informational disclaimer that displayed values are for information only and do not constitute investment advice, in Arabic (and English when English UI is enabled).
- **FR-006**: The administration product MUST be restricted to internal operators; consumer journeys MUST NOT expose administration URLs, roles, or actions.
- **FR-007**: Administrators MUST be able to manage upstream credentials and enable/disable sources without developer intervention (within the limits of the administration UI).
- **FR-008**: Administrators MUST be able to manage the curated Egyptian equity symbol set and its ordering for the consumer list.
- **FR-009**: Administrators MUST be able to manage which FX pairs and metal presentations are visible to consumers, within provider-supported bounds.
- **FR-010**: The system MUST log security-relevant administration events (sign-in success/failure, credential changes, symbol publish changes) for audit review.
- **FR-011**: For Egyptian equities, the consumer MUST be able to browse the curated list, open detail, and view a historical chart for defined periods, subject to data availability from the configured backend integration.
- **FR-012**: The consumer mobile product MUST support Arabic as default and English as an optional UI language for MVP screens in scope, with appropriate text direction.
- **FR-013**: For MVP, foreign exchange versus EGP MUST use **official, central bank, or other agreed institutional** rate categories only, as configured by administrators and labeled for consumers. **Parallel market, unofficial, or "street" EGP rates MUST NOT** appear in consumer-facing MVP FX surfaces. If a future release introduces such streams, they MUST be specified and labeled distinctly from official-category streams (separate specification amendment).
- **FR-014**: The product MUST allow **anonymous** users to view market prices and public browsing surfaces (Stories 1–2) without creating an account.
- **FR-015**: **Personal trade journal** entries, **personal portfolio** tracking, **watchlist persistence**, and any other **advanced** consumer capabilities enumerated during planning MUST require a **signed-in** consumer account; unauthenticated users MUST be prompted to sign in or register when initiating those flows.
- **FR-016**: The **free browsing** tier (anonymous or signed-out price viewing) MUST integrate **Google Mobile Ads (AdMob)** for banner and/or interstitial placements chosen in planning; placements MUST NOT obscure mandatory disclaimers or primary price fields; the implementation MUST follow applicable store and regional ad policies (including minors and sensitive financial context as required).

### Key Entities *(include if feature involves data)*

- **Instrument**: A tradable or quoted item (currency pair leg versus EGP, metal product, or listed equity) with stable identifier, human display name, and consumer visibility flag.
- **Quote snapshot**: A point-in-time or session-bound set of fields (price, change, volume where applicable) with timestamp and freshness/session metadata.
- **Historical series**: Ordered observations for charting, tied to an instrument and a resolution (e.g. daily), with known gaps policy.
- **Administrator account**: Identity used only for the administration product, with authentication and audit trail.
- **Consumer account**: Optional end-user identity used for syncing gated features (watchlist, journal, portfolio); distinct from administrator accounts; subject to privacy minimization per constitution.
- **Trade journal entry**: User-authored record of a personal transaction note (not an executed broker order); ties to instrument and optional cost basis for portfolio math.
- **Upstream source configuration**: Non-consumer record of provider endpoints, credentials references, enablement, and last successful sync metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a typical broadband mobile connection, a user opening the home or primary FX screen sees meaningful numeric content (values or explicit controlled empty state) within 5 seconds on cold start in 95% of trials during MVP acceptance testing.
- **SC-002**: When upstream sources are healthy, stale data shown to consumers is never older than the maximum staleness threshold defined for MVP without showing an explicit "stale" or "as of" indicator.
- **SC-003**: 100% of consumer-facing price screens in MVP scope display the non-advisory disclaimer in the active UI language.
- **SC-004**: Administration tasks for changing the curated equity list and toggling a major FX pair visibility are completable by a trained administrator in under 10 minutes end-to-end in guided acceptance testing (excluding upstream vendor onboarding legal steps).
- **SC-005**: Unauthorized access attempts to administration capabilities are blocked in 100% of negative-test cases in MVP security testing.
- **SC-006**: At least one full exploratory session per prioritized user story (P1–P3 as delivered) completes without data contradictions between summary and detail for the same instrument under stable upstream conditions.
- **SC-007**: In acceptance testing on free browsing paths, AdMob placements render or fail gracefully in 100% of trials without blocking access to disclaimers or primary numeric prices (ads may be empty but core content remains).

## Assumptions

- MVP ships three separately versioned products (backend, mobile, admin) coordinated only via documented contracts, per constitution; planning will name repositories but this spec stays product-oriented.
- **Consumer identity**: Anonymous users get full **read-only** market browsing (Stories 1–2). A **consumer account** is required for watchlist persistence, personal trade journal, personal portfolio, and other advanced features defined in planning.
- **Monetization**: Free browsing includes **AdMob**; account-only features may remain ad-supported or ad-reduced per planning (not locked in this spec).
- Exact upstream vendors and licensing are chosen in planning/implementation; this spec requires labeling and risk handling, not a named vendor.
- **EGP FX for MVP**: Only **official / central bank / agreed institutional** categories; parallel or unofficial EGP is **explicitly excluded** from MVP (clarification 2026-05-12).
- Equity "live" behavior follows actual market session rules for EGX; anything beyond cash equities is out of scope unless amended.
- Push notifications, price alerts, and **automated** news feeds remain out of scope for this MVP spec unless amended; **user-maintained** journal and portfolio for signed-in users are **in scope** per clarifications.

## Out of Scope (this spec)

- Executing trades through a broker, linking live brokerage accounts for order routing, or holding customer funds on behalf of users.
- Automated investment recommendations or robo-advisory logic.
- Monorepo or shared UI code across mobile and admin.
- Consumer-facing **parallel market or unofficial EGP** exchange rates in MVP (deferred to a future amendment with distinct labeling requirements).
