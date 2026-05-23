# Tharwa marketing website

Public landing site for Tharwa with CMS-driven pages and navigation.

## Stack

- **Vite + React** with React Router
- **Tailwind CSS v4**
- Content and menus from `backend-api` (`GET /v1/site/*`)

## Run locally

From the **sarwa** repo root (starts API, admin, and website):

```bash
npm install
npm run dev
```

Or separately:

```bash
npm run dev --prefix backend-api   # port 3000
npm run dev --prefix website       # port 3002
```

## Configuration

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE` | Production: browser calls this API origin |
| `VITE_BACKEND_PROXY_TARGET` | Dev: Vite proxies `/__tharwa_api` here |

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/:slug` | CMS page (e.g. `/privacy`, `/contact`) |

## Admin

Manage pages and header/footer menus in the admin dashboard:

- **Website pages** — `/website/pages`
- **Website navigation** — `/website/navigation`
