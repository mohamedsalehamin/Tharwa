# Feature Specification: Masar — Investor Profile & Illustrative Model (مسار)

**Feature Branch**: `003-masar-investor-profile`

**Created**: 2026-06-29

**Status**: Draft

**Input**: User description: "Masar: a personality-based investor profile that turns a short quiz into a named investor archetype and an illustrative, educational model portfolio (equities / fixed income / gold), with a historical comparison against EGP inflation, USD, and gold, and links into the existing wealth-planning layer (goals, watchlist, learn). Informational only — no personalized advice, no brokerage, no order execution."

## Summary

Today a new Tharwa user who wants to start building wealth faces the hardest question first: *"where do I even begin?"*. Tharwa can already track net worth, plan goals, and show real-return — but it gives the user no guided on-ramp that reflects **who they are** as an investor.

**Masar (مسار)** is that on-ramp. The user answers a short quiz about their goal, comfort with volatility, time horizon, and Sharia preference. From the answers, Masar:

1. **Names an investor archetype (شخصية المستثمر)** — e.g. *المحافِظ*, *المتوازن*, *النامي المتوازن*, *الجريء طويل المدى* — with a plain-language educational description of what people with this profile typically care about.
2. **Shows an illustrative model mix (نموذج توضيحي)** across three **asset classes only** — equity funds, fixed-income funds, and gold — never specific securities or funds. The user can adjust the mix in 5% steps until it totals 100%.
3. **Shows how a mix like this behaved historically** against EGP inflation, USD/EGP, and gold over a selectable period, reusing the existing Wealth-Planning benchmark data.
4. **Connects to the planning layer the user already has**: turn the model into a **Financial Goal**, add the asset classes to **Watchlist**, or open the relevant **Learn** content — instead of any "invest now" / order action.

Masar is **explicitly informational and non-advisory**. It mirrors the *spirit* of a guided starter experience without crossing into brokerage, order execution, personalized investment advice, or guaranteed returns (constitution Principle VI + Explicit Out of Scope). Because Tharwa is not a broker and holds no funds, Masar's outputs are framed as **educational archetypes and illustrative models**, not recommendations tailored to an individual's circumstances.

The quiz and its result are available to anyone (a low-friction acquisition funnel); **persisting** a profile and the planning hand-offs (goal, watchlist) require a signed-in consumer, consistent with the rest of the planning layer.

## Clarifications

### Session 2026-06-29

- Q: Does the model portfolio reference specific securities or funds? → A: **No.** The model is expressed at the **asset-class level only** (equity / fixed income / gold). Naming specific instruments or "buy this fund" would constitute tailored advice/execution and is out of scope per the constitution.
- Q: Is the historical comparison a forward projection? → A: **No.** It is a **backward-looking illustration** of how the chosen asset-class mix would have tracked against published benchmarks (inflation, USD, gold). It is labeled illustrative and is never presented as an expected or guaranteed future return.
- Q: Must the user be signed in to use Masar? → A: **No to take the quiz and see the result; yes to persist it.** The quiz + illustrative result are open (no personal data stored). Saving a profile, creating a goal, or adding to watchlist requires a signed-in consumer account and follows existing gating.
- Q: How does the Sharia preference affect the output? → A: When the user prefers Sharia-compliant investing, the archetype description and asset-class framing are presented in their **Sharia-compliant form** (e.g. Sharia-compliant equity/income framing), and Learn hand-offs point to Sharia-compliant educational content. Masar does not certify compliance of any specific instrument.
- Q: How many investor archetypes does the MVP define? → A: **Five**, forming an equity-ascending ladder: المحافِظ (Conservative) 20/55/25, المتوازن الحذِر (Cautiously Balanced) 35/45/20, المتوازن (Balanced) 50/35/15, النامي المتوازن (Growth-Balanced) 70/20/10, الجريء طويل المدى (Aggressive Long-Term) 85/5/10 — percentages are equity/fixed-income/gold and are the **default illustrative** mixes (user-adjustable).
- Q: When an anonymous user completes the quiz then signs in, what happens to the result? → A: It is **carried over** into the session and the user is **offered to save it** (no retake, no silent auto-save); saving requires explicit consent.
- Q: When a signed-in user retakes the quiz, how is the previous saved result handled? → A: **Keep latest only** — the new result overwrites the previous saved Masar result (no version history).
- Q: Does the Sharia preference change the allocation percentages? → A: **No.** It changes framing/labels and Learn routing only; the allocation percentages are unchanged, and fixed income is presented in its Sharia-compliant (e.g. sukuk) form.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Discover my investor archetype from a short quiz (Priority: P1)

As a **consumer** (signed-in or not), I want to answer a few simple questions and receive a named investor archetype with a clear explanation, so I understand what kind of investor I am and feel confident taking a first step.

**Why this priority**: This is the core "personality" experience and the entire funnel's entry point. It delivers standalone value (self-knowledge + education) even before any model or planning hand-off exists.

**Independent Test**: Complete the quiz with a known set of answers and verify the returned archetype is deterministic, named, and accompanied by an educational description in the active language — without implementing the model mix, backtest, or planning hand-offs.

**Acceptance Scenarios**:

1. **Given** any consumer on the Masar entry screen, **When** they start the quiz, **Then** they are presented with the defined questions (investment goal, comfort with volatility, near-term need for the money, Sharia preference) one step at a time with progress indication.
2. **Given** a consumer who answers all questions, **When** they submit, **Then** the system returns exactly one named archetype derived deterministically from their answers, with a plain-language educational description of that archetype.
3. **Given** the same answers submitted twice, **When** the archetype is computed, **Then** the result is identical (deterministic mapping).
4. **Given** a consumer who selects the Sharia-compliant preference, **When** the result is shown, **Then** the archetype description and asset-class framing are presented in their Sharia-compliant form.
5. **Given** a consumer who has not answered every required question, **When** they try to proceed, **Then** they are prevented from submitting until required answers are provided (no partial/ambiguous archetype).
6. **Given** the result screen renders, **When** the user reads it, **Then** the experience makes clear — through naming and concise microcopy, not a heavy legal banner — that this is an **educational archetype**, not personalized advice.

---

### User Story 2 — See an illustrative model mix I can adjust (Priority: P1)

As a **consumer**, I want to see an illustrative model mix across equities, fixed income, and gold for my archetype, and adjust the percentages myself, so I get a tangible starting picture I understand and own.

**Why this priority**: The model mix turns an abstract archetype into something concrete and is the visual centerpiece (the donut). It is the second half of the core experience and is independently demonstrable once archetypes exist.

**Independent Test**: For a given archetype, verify the system returns a default illustrative allocation across exactly the three asset classes summing to 100%, that the user can change allocations in 5% steps, and that the UI blocks confirming a mix that does not total 100% — without requiring the backtest or planning hand-offs.

**Acceptance Scenarios**:

1. **Given** a computed archetype, **When** the model is shown, **Then** the system presents a default illustrative allocation across exactly three asset classes (equity, fixed income, gold) that sums to 100%, expressed at asset-class level with no specific securities or funds named.
2. **Given** the model is shown, **When** the consumer adjusts an allocation, **Then** changes occur in 5% steps and the consumer cannot confirm a mix unless the total equals 100%.
3. **Given** an adjusted mix, **When** the consumer resets, **Then** the model returns to the archetype's default allocation.
4. **Given** any model screen, **When** it renders, **Then** copy clearly frames the mix as an **illustrative, educational model** — not a recommendation, allocation advice, or instruction to buy.
5. **Given** the Sharia-compliant preference is set, **When** the model renders, **Then** each asset class is framed in its Sharia-compliant form and no interest-based framing is presented as the user's mix.

---

### User Story 3 — See how a mix like this behaved historically (Priority: P2)

As a **consumer**, I want to see how a mix like mine would have tracked against Egyptian inflation, the US dollar, and gold over a period I choose, so I understand — in the Egyptian context — what holding such a mix has historically meant for the real value of money.

**Why this priority**: A high-impact, Egypt-specific differentiator and the educational "aha". It depends on benchmark data already introduced by the Wealth-Planning feature, so it follows the core archetype/model stories.

**Independent Test**: With benchmark series available for a selected period, verify the view shows the illustrative historical change of the chosen asset-class mix alongside EGP inflation, USD/EGP, and gold for the same period, clearly labeled illustrative — without requiring profile persistence.

**Acceptance Scenarios**:

1. **Given** a chosen model mix and a selectable period, **When** the consumer opens the historical view, **Then** they see the illustrative historical change of that mix alongside EGP inflation, USD/EGP, and gold for the same period.
2. **Given** the historical view, **When** it renders, **Then** it is explicitly labeled a **backward-looking illustration**, never a prediction, expected value, or guaranteed return.
3. **Given** benchmark data is unavailable or stale for the selected period, **When** the view renders, **Then** the affected comparison shows an explicit unavailable/"as of" state rather than a misleading zero.
4. **Given** insufficient benchmark history for the selected period, **When** the consumer opens the view, **Then** they see a clear insufficient-data state explaining a different period is needed.
5. **Given** the historical figures are market-derived, **When** they are shown, **Then** each carries freshness/"as of" semantics and is never presented as a silent guaranteed-live figure.

---

### User Story 4 — Turn my Masar into a plan (Priority: P2)

As a **signed-in** consumer, I want to save my Masar result and turn it into something actionable inside Tharwa — a financial goal, items to watch, or learning content — so the experience leads somewhere concrete without implying a trade.

**Why this priority**: This is the bridge from "personality" to Tharwa's existing planning value and the key differentiator from a broker's "invest now" button. It depends on US1/US2 and the existing planning layer.

**Independent Test**: As a signed-in consumer with a computed Masar result, verify the result can be saved, that "turn into a goal" pre-fills a Financial Goal flow, and that "add to watchlist" and "learn more" route to the existing surfaces — with all of these gated behind authentication.

**Acceptance Scenarios**:

1. **Given** a signed-in consumer viewing a Masar result, **When** they choose to save it, **Then** the archetype, the (possibly adjusted) model mix, the Sharia preference, and a timestamp are persisted to their account and retrievable later.
2. **Given** a saved Masar result, **When** the consumer chooses "turn into a goal", **Then** the existing Financial Goal creation flow opens pre-filled with context from Masar (and the goal is created using the existing no-assumed-return required-saving math).
3. **Given** a Masar result, **When** the consumer chooses "add to watchlist" or "learn more" for an asset class, **Then** they are routed to the existing Watchlist or Learn surfaces with relevant context.
4. **Given** an anonymous/signed-out user, **When** they attempt to save a result, create a goal, or add to watchlist from Masar, **Then** they are prompted to sign in or register before any personal data is stored.
5. **Given** a consumer who retakes the quiz, **When** they save again, **Then** the latest result is stored and the previous result history is handled per the defined retention rule without data loss or duplication errors.
6. **Given** a signed-out user, **When** they sign out, **Then** their saved Masar profile is not visible without re-authentication.

---

### Edge Cases

- **Inconsistent answers**: A consumer who selects long-term growth yet "needs the money within a year" must still resolve to a single defined archetype via documented tie-breaking rules (no undefined/empty result).
- **"Not sure" answers**: Selecting uncertainty options (e.g. "لست متأكدًا") must map to a defined, more conservative archetype rather than failing.
- **Adjusted mix away from archetype**: A consumer who edits the model far from the archetype default still sees a valid, 100%-summing model and a result they can save; the archetype label still reflects their quiz answers, not the edited mix.
- **Sharia preference toggled after result**: Changing the Sharia preference re-frames the description and asset-class presentation consistently for the shown result.
- **Stale/missing benchmark**: The historical view degrades gracefully (explicit unavailable/"as of" state) without blocking the archetype and model.
- **Anonymous quiz then sign-in**: A result computed anonymously is carried into the authenticated session and the user is offered to save it (no forced retake, no silent auto-save) per FR-022.
- **Practice portfolio**: Masar must not read from or write to the virtual practice/simulation portfolio.
- **Locale switch**: Switching language re-renders archetype names, descriptions, asset-class labels, and microcopy in the active language with correct RTL for Arabic.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present a short quiz with a defined, fixed set of questions covering at minimum: the consumer's primary investment goal, comfort with volatility, whether they expect to need the money within the near term, and Sharia-compliance preference.
- **FR-002**: The system MUST require an answer to every required question before producing a result and MUST prevent submission of a partial quiz.
- **FR-003**: The system MUST map a complete set of answers **deterministically** to exactly one named investor archetype from a defined set of **five** archetypes (المحافِظ، المتوازن الحذِر، المتوازن، النامي المتوازن، الجريء طويل المدى), including documented tie-breaking for inconsistent or "not sure" answers that always resolves to a single, more-conservative-leaning archetype when ambiguous.
- **FR-004**: The archetype-derivation logic MUST be owned by the backend as the single source of truth; clients MUST NOT independently re-implement the mapping such that results could drift between clients.
- **FR-005**: For each archetype, the system MUST present an **illustrative model allocation** across exactly three asset classes — equity, fixed income, and gold — whose percentages sum to 100%, expressed at **asset-class level only** with no specific securities, tickers, or funds named. The default per-archetype mixes (equity/fixed-income/gold) are: المحافِظ 20/55/25, المتوازن الحذِر 35/45/20, المتوازن 50/35/15, النامي المتوازن 70/20/10, الجريء طويل المدى 85/5/10.
- **FR-006**: The system MUST allow the consumer to adjust the model allocation in 5% increments and MUST prevent confirming/saving a mix unless the total equals exactly 100%, with a reset to the archetype default available.
- **FR-007**: When the consumer indicates a Sharia-compliance preference, the system MUST present the archetype description, asset-class framing (e.g. fixed income presented in its Sharia-compliant sukuk form), and Learn hand-offs in their Sharia-compliant form, **without changing the allocation percentages** and without certifying the compliance of any specific instrument.
- **FR-008**: The system MUST provide a **backward-looking historical illustration** that shows how the selected asset-class mix would have tracked against EGP inflation, USD/EGP, and gold over a consumer-selectable period, reusing backend-served benchmark data (no client calls to external providers).
- **FR-009**: The historical illustration MUST be explicitly labeled as illustrative and backward-looking and MUST NOT be presented as a prediction, expected value, or guaranteed return; market-derived values MUST carry freshness/"as of" semantics.
- **FR-010**: The historical illustration MUST degrade gracefully: when benchmark data is unavailable/stale or history is insufficient for the selected period, it MUST show an explicit unavailable/insufficient-data state rather than a misleading zero.
- **FR-011**: The quiz and the resulting archetype + illustrative model MUST be viewable by anonymous (signed-out) consumers **without storing any personal data**; the result is computed and shown transiently.
- **FR-012**: Persisting a Masar result, turning it into a Financial Goal, and adding asset classes to Watchlist MUST require a signed-in consumer account; anonymous users attempting these actions MUST be prompted to authenticate before any personal data is stored.
- **FR-013**: For a signed-in consumer, the system MUST persist a saved Masar result comprising at least: the archetype, the (possibly adjusted) model allocation, the Sharia preference, and a timestamp; and MUST allow the consumer to retrieve and retake it.
- **FR-014**: The system MUST allow a signed-in consumer to **turn a Masar result into a Financial Goal**, opening the existing goal-creation flow pre-filled with Masar context and using the existing no-assumed-return required-saving calculation (no new return assumptions introduced by Masar).
- **FR-015**: The system MUST provide hand-offs from a Masar result to the existing **Watchlist** and **Learn** surfaces with relevant asset-class context, instead of any order-placement or "invest now" action.
- **FR-016**: The system MUST NOT present any brokerage, order execution, "buy"/"invest now", guaranteed-return, or individually-tailored-advice affordance anywhere in the Masar experience.
- **FR-017**: All Masar surfaces MUST make the **educational, illustrative, non-advisory** nature clear in the active UI language through naming and concise microcopy (e.g. labeling outputs as "نموذج توضيحي"/"شخصية المستثمر"), with a lightweight optional "learn what this means" affordance rather than an intrusive legal banner.
- **FR-018**: Masar MUST exclude the virtual practice/simulation portfolio entirely; it MUST neither read from nor write to practice data.
- **FR-019**: All Masar consumer-facing copy MUST support Arabic (default, RTL) and English (secondary) using existing localization conventions; archetype names and descriptions MUST exist in both languages.
- **FR-020**: Saved Masar profile data MUST follow the same privacy, gating, and retention posture as other signed-in planning data: minimal data collected, not visible after sign-out without re-auth, and removed/handled consistently on account deletion.
- **FR-021**: The system MUST keep only the **latest** saved Masar result per consumer: retaking the quiz and saving **overwrites** the previous result (no version history), so a consumer always has exactly one active saved profile.
- **FR-022**: When a result was computed by an anonymous user who then signs in or registers, the system MUST **carry the result over** into the authenticated session and **offer to save it** (no forced retake and no silent auto-save); saving still requires the consumer's explicit action per FR-013.

### Key Entities *(include if feature involves data)*

- **InvestorArchetype**: One of **five** named investor profiles forming an equity-ascending ladder — المحافِظ (Conservative, 20/55/25), المتوازن الحذِر (Cautiously Balanced, 35/45/20), المتوازن (Balanced, 50/35/15), النامي المتوازن (Growth-Balanced, 70/20/10), الجريء طويل المدى (Aggressive Long-Term, 85/5/10). Attributes: identifier, localized name, localized educational description, default illustrative allocation (equity/fixed-income/gold), Sharia-compliant presentation variant (same percentages, sukuk-form framing). Reference data, not per-user.
- **QuizQuestion / QuizAnswer (transient input)**: The fixed question set and a consumer's selected answers used to derive an archetype. Answers for anonymous users are transient and not persisted.
- **MasarResult**: A signed-in consumer's saved outcome — **exactly one active record per consumer** (retake overwrites it). Attributes: owner (consumer), derived archetype, selected model allocation (possibly adjusted), Sharia preference, created/updated timestamp.
- **ModelAllocation (value, not stored separately)**: A set of asset-class weights (equity %, fixed income %, gold %) summing to 100%, expressed at asset-class level only.
- **Benchmark comparison (derived, reused)**: For a selected period, the illustrative historical change of a model allocation versus EGP inflation, USD/EGP, and gold — computed from the existing backend-served benchmark series; not newly stored by Masar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consumer can complete the quiz and see a named archetype in under 90 seconds end-to-end on a typical mobile connection in 95% of trials.
- **SC-002**: The same set of quiz answers produces the same archetype in 100% of verification cases (deterministic mapping), including ambiguous/"not sure" answer sets that always resolve to a single defined archetype.
- **SC-003**: 100% of presented model mixes sum to exactly 100% and reference only asset classes (equity/fixed income/gold) with zero specific securities or funds named.
- **SC-004**: 100% of Masar surfaces convey the educational/illustrative/non-advisory nature in the active UI language, and 0 Masar surfaces present a brokerage, order-execution, "invest now", or guaranteed-return affordance.
- **SC-005**: For any selected period with available benchmark data, the historical illustration correctly reflects the chosen mix's change against inflation, USD, and gold for that period in 100% of verification cases, and shows an explicit unavailable/insufficient state otherwise.
- **SC-006**: In 100% of negative-test cases, anonymous/signed-out users are blocked from saving a profile, creating a goal, or adding to watchlist and are prompted to authenticate.
- **SC-007**: A signed-in consumer can turn a Masar result into a Financial Goal in under 1 minute, with the goal's required-saving figure computed by the existing no-assumed-return logic (Masar introduces no new return assumptions).
- **SC-008**: The virtual practice portfolio contributes nothing to and is never modified by Masar in 100% of verification cases.

## Assumptions

- **Reuse of planning data**: Masar's historical illustration reuses the inflation/USD/gold benchmark series and freshness semantics introduced by the Wealth-Planning Core feature (002); Masar does not introduce a new market-data source or call external providers (constitution Principle III).
- **No new return math**: Goal hand-off uses the existing no-assumed-return required-saving calculation; Masar contributes context (target framing), not new projections.
- **Asset-class level only**: Models are intentionally limited to three asset classes and never name instruments, keeping the feature firmly informational/educational and out of advice/execution scope.
- **Open quiz, gated persistence**: The quiz and transient result are available to anonymous users to lower friction; all persistence and planning hand-offs require the existing consumer auth and gating.
- **Anonymous-to-signed-in carry-over**: A result computed anonymously is carried into the account upon sign-in/registration and the user is offered to save it (no forced retake, no auto-save) — see FR-022.
- **Archetype set**: The MVP defines **five** archetypes forming an equity-ascending ladder with the default allocations listed in FR-005 / InvestorArchetype. Exact wording of names/descriptions and the full answer→archetype mapping table are finalized during planning with product input, but the count (5) and default mixes are fixed by this spec.
- **Sharia framing**: Sharia preference changes presentation/framing and Learn routing; it is not a certification of any specific instrument's compliance.
- **Localization**: Arabic is default with RTL; English is secondary. Archetype/branding name in product UI is "مسار" (Masar).
- **Self-reported posture**: Quiz answers and saved results are user-authored records analogous to the existing trade journal and planning data; Tharwa does not verify them and holds no funds.

## Out of Scope (this spec)

- Brokerage execution, order placement, "invest now"/bulk-order, or linking live brokerage/bank accounts.
- Recommending or naming specific securities, funds, or instruments; portfolio-construction advice at the instrument level.
- Personalized investment advice tailored to an individual's full financial circumstances, or any guaranteed/expected forward return projection.
- Automated rebalancing, recurring-contribution automation/DCA backtesting, or tax computation.
- New market-data sources beyond the benchmark series already served by the backend for the Wealth-Planning feature.
- An AI conversational coach for Masar (a possible later phase); the MVP is the deterministic quiz → archetype → illustrative model → planning hand-off flow.
