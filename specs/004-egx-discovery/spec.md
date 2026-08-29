# Feature 004: EGX discovery — RVOL + sector heatmap

**Date**: 2026-08-29  
**Status**: Implemented (P0)  
**Constraint**: Informational only. No gold buy/sell desk. No execution.

## What

Deepen the EGX market tab using Tradify-style discovery, without cloning Tradify Premium or iSagha commerce.

1. **Relative volume (RVOL)** on EGX movers: today’s volume vs 10-session and 30-session averages from the TradingView Egypt scanner. New list `unusual` sorts by 10-day relative volume.
2. **Sector heatmap**: equal-weight mean `changePct` of published `sector` equity lists against the cached EGX market snapshot. Tap a cell → existing list stocks screen.

## Out of scope

Gold sagha bid/ask, jewelry shop, stock screener presets, compare overlay, paywalled chart ranges, after-close brief changes.

## Acceptance

- `GET /v1/stocks/egypt/movers?list=volume|unusual|gainers|losers` returns `rvol10`, `rvol30`, `avgVolume10d`, `avgVolume30d` (nullable).
- `GET /v1/stocks/egypt/lists/heatmap` returns one cell per published sector list.
- Market tab shows RVOL on mover cards, an Unusual volume chip, and a sector heatmap.
- Copy remains indicative / not advice.
