# Tanzania Car Dealers

Car marketplace for Tanzania. Anyone can post a car for free, admins approve ads, dealers get their own pages, and buyers contact sellers on WhatsApp.

## Pages

| Page | What it does |
|---|---|
| `/` | All cars for sale with search and filters. Featured ads first. |
| `/car?id=…` | One car: photos, details, WhatsApp the seller. |
| `/sell` | Form for anyone to post a car with up to 6 photos. Ads start as "pending". |
| `/dealers`, `/dealer?id=…` | Dealer list and each dealer's page with their stock. |
| `/admin` | Staff only. Approve or reject ads, make ads Featured for 7/14/30 days, mark sold, delete, add dealers and link ads to them, manage users. |

## Admin users

- The first visit to `/admin` shows a one-time **Create the admin account** screen. It asks for the setup key (`ADMIN_PASSWORD`) and lets you choose your own admin ID and password.
- After that everyone logs in with an **ID and password**.
- **Admin** users can do everything, including the **Users** tab: add users, change roles, reset passwords, disable or delete accounts.
- **Staff** users can manage ads and dealers but cannot delete anything or manage users.
- Everyone can change their own password with **My password**.
- There is always at least one active admin; admins cannot remove their own access.
- Forgot the only admin password? Delete the `users/` files from the Blob store and the setup screen appears again.

## How it is built

- Plain HTML/CSS/JS pages, no build step. Shared code is in `assets/app.js` and `assets/style.css`.
- Server code is Vercel Functions in `api/` (`listings`, `submit`, `admin`) with helpers in `lib/`.
- Ads, dealers, users and photos are stored in Vercel Blob (`ads/<id>/…`, `dealers/<id>/…`, `users/<id>/…`, `photos/<id>/…`). Records are never overwritten: each save writes a new version and removes older ones, so reads are never stale. User records are encrypted and passwords are hashed.

## Settings

- **WhatsApp number, email, location:** `config.js`
- **Our own stock:** `cars.js` (shown as "Tanzania Car Dealers" cars)
- **Environment variables on Vercel:** `BLOB_READ_WRITE_TOKEN` (storage), `ADMIN_PASSWORD` (one-time setup key for the first admin account), `SESSION_SECRET` (signs sessions and encrypts user records; changing it logs everyone out and makes existing users unreadable).

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
