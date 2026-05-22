<!--
Sync Impact Report
- Version change: unversioned template (placeholders only) → 1.0.0
- Modified principles: initial adoption — all template placeholders replaced with Tharwa principles
- Added sections: Technical Architecture & Stack Constraints; Explicit Out of Scope
- Removed sections: none
- Templates: .specify/templates/plan-template.md ✅ | .specify/templates/spec-template.md ✅ |
  .specify/templates/tasks-template.md ✅ | .specify/templates/commands/*.md — N/A (path not present)
- Follow-up TODOs: none
-->

# Tharwa (ثروة) Constitution

## Core Principles

### I. Specification Before Implementation

Every task MUST begin with a written specification that states WHAT will be built, acceptance
criteria, and explicit constraints. An implementation plan and ordered task breakdown MUST
exist before implementation starts. Features outside the approved specification scope MUST NOT
be built unless the specification is amended and re-approved.

**Rationale**: Prevents scope drift and keeps consumer financial data handling deliberate and
reviewable.

### II. Repository Separation & API Contracts (No Monorepo)

The system MUST be maintained as three independent repositories: `backend-api`,
`mobile-app` (React Native), and `admin-dashboard` (web administration). A monorepo that
merges these products MUST NOT be introduced unless this constitution is amended with
recorded rationale. Cross-repository behavior MUST be coordinated through a documented API
contract, preferably OpenAPI, with explicit API versioning. Business rules and data shapes MUST
NOT be duplicated by hand across clients without a single source of truth (generated types,
shared packages published from the contract, or equivalent).

**Rationale**: Clear ownership and release isolation; prevents silent drift between mobile,
admin, and backend.

### III. Backend as the Source of Truth for Market Data

The mobile app and admin dashboard MUST NOT call external market data providers directly. The
backend MUST ingest, normalize, cache when specified, and serve data through REST and/or
WebSockets as defined in the specification. Clients consume only backend APIs.

**Rationale**: Centralizes credentials, rate limits, legal/operational handling, and
consistent pricing semantics.

### IV. Security & Governance

The admin dashboard MUST use strong authentication; multi-factor authentication (2FA) for
administrators SHOULD be enabled where technically feasible. Network access controls (for
example VPN or IP allowlists) MUST be applied when the architecture calls for them. Regular
end users MUST NOT have access to administration capabilities or routes.

API secrets and provider credentials MUST be managed as secrets (secret managers or secure
environment injection); they MUST NOT appear in source control or client bundles.

**Rationale**: Admin and provider keys are high-value targets; separation of admin from
consumer reduces attack surface.

### V. Privacy & Minimal Data Collection

Only the minimum user and device data necessary for the service and notifications MUST be
collected and retained. A clear, current data inventory (what is stored, why, retention) MUST
accompany features that handle personal or device data. Releases MUST comply with applicable
app store policies.

**Rationale**: Trust and regulatory alignment for a consumer finance-adjacent product.

### VI. Financial Data Transparency

The application MUST surface, where applicable, the source and nature of pricing (for example
delayed quotes, official venue data, estimates, or third-party aggregations). The product MUST
NOT imply brokerage, order execution, guaranteed returns, or personalized investment advice
unless explicitly in scope with required legal disclaimers and compliance review.

**Rationale**: Users must understand what they are seeing; misrepresentation creates legal
and reputational risk.

### VII. Third-Party Dependency Management

Integrations that supply prices, charts, or other external APIs (including commercial or
unofficial sources) MUST document operational and legal risks in the specification. The
system MUST support graceful degradation: clear error messaging, use of cached or stale data
when safe and specified, and temporary disabling of dependent features when upstreams fail.

**Rationale**: External feeds fail; the product must degrade predictably.

### VIII. Performance & Reliability

When the architecture specifies caching (for example Redis), it MUST be used as designed.
Request rate limiting MUST protect backend endpoints. Service health MUST be observable via
the admin dashboard, external monitoring, or both as defined in the plan.

**Rationale**: Protects providers, users, and infrastructure under load and incident
conditions.

### IX. Arabic & English Support

Arabic MUST be the primary supported language; English MAY be offered as secondary. User
interfaces MUST support RTL layout for Arabic and use consistent financial terminology across
locales.

**Rationale**: Primary audience clarity and professional presentation of market data.

### X. Quality & Validation Gates

When security review tools or commands are available, plans, tasks, and implementations SHOULD
undergo security review at the points defined in project workflow. A feature MUST NOT be
considered complete until acceptance tests demonstrate conformance to the original
specification.

**Rationale**: Financial and security-sensitive domains require explicit verification.

## Technical Architecture & Stack Constraints

- **Consumer mobile**: React Native; Expo MAY be used when the implementation plan records the
  choice and implications.
- **Backend**: Node.js with a relational database (for example PostgreSQL); a cache layer
  (for example Redis) MUST be used when the specification or plan requires it.
- **Administration**: Separate web application, reachable only to authorized operators, with
  no feature parity expectation for regular mobile users.
- **Real-time**: WebSocket and/or REST delivery MUST match what is specified per capability.

## Explicit Out of Scope

Unless a future specification explicitly includes them and governance approves scope change,
the following remain out of scope: real trading execution or brokerage integration; promises
of guaranteed profits; personalized investment recommendations presented as tailored advice.

## Governance

This constitution supersedes informal coding preferences for Tharwa. Amendments MUST be
documented in `.specify/memory/constitution.md` with an updated Sync Impact Report, version
bump, and `LAST_AMENDED_DATE`.

**Versioning** (semantic, governance document): MAJOR — removal or incompatible redefinition
of a principle; MINOR — new principle or materially expanded obligation; PATCH — wording,
clarifications, or non-semantic refinements.

Compliance with applicable principles MUST be checked during planning (`Constitution Check` in
`plan.md`), task authoring, implementation, and review. Conflicts between a feature and this
constitution MUST be resolved by changing the feature design or formally amending this
document — not by silent exceptions.

**Version**: 1.0.0 | **Ratified**: 2026-05-12 | **Last Amended**: 2026-05-12
