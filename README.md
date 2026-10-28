# Tanzania Car Dealers

Car marketplace for Tanzania. Anyone can post a car for free, admins approve ads, dealers get their own pages, and buyers contact sellers on WhatsApp.

## Pages

| Page | What it does |
|---|---|
| `/` | All cars for sale with search and filters. Featured ads first. |
| `/car?id=…` | One car: photos, details, WhatsApp the seller. |
| `/sell` | Form for anyone to post a car with up to 6 photos. Ads start as "pending". |
| `/dealers`, `/dealer?id=…` | Dealer list and each dealer's page with their stock. |
| `/admin` | Staff only. Approve or reject ads, make ads Featured for 7/14/30 days, mark sold, delete, add dealers and link ads to them. |

## How it is built

- Plain HTML/CSS/JS pages, no build step. Shared code is in `assets/app.js` and `assets/style.css`.
- Server code is Vercel Functions in `api/` (`listings`, `submit`, `admin`) with helpers in `lib/`.
- Ads, dealers and photos are stored in Vercel Blob (`ads/<id>.json`, `dealers/<id>.json`, `photos/<id>/…`).

## Settings

- **WhatsApp number, email, location:** `config.js`
- **Our own stock:** `cars.js` (shown as "Tanzania Car Dealers" cars)
- **Environment variables on Vercel:** `BLOB_READ_WRITE_TOKEN` (storage), `ADMIN_PASSWORD` (admin login), `SESSION_SECRET` (signs admin sessions).

## Run locally

```bash
npm install
vercel env pull .env.local
vercel dev
```

## Deploy

```bash
vercel deploy --prod
```
