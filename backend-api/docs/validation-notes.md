# Validation notes (manual)

Run the steps in `specs/001-tharwa-platform-mvp/quickstart.md` against a local Postgres + Redis stack, then smoke-test:

- `GET /health`
- `POST /admin/v1/auth/login` and bearer `GET /admin/v1/instruments`
- `POST /v1/auth/register`, `POST /v1/auth/login`, bearer `GET /v1/watchlist`, `GET /v1/portfolio/summary`

Record failures and fixes here as the MVP hardens.
