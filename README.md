# Tanzania Car Dealers

Car marketplace for Tanzania. Every seller (private person or car dealer) creates an account and is verified by our team (ID or business documents checked and phone confirmed) before they can post cars. Buyers contact sellers on WhatsApp.

## Pages

| Page | What it does |
|---|---|
| `/` | Cars for sale with search and filters. Featured cars first. |
| `/car?id=…` | One car: photos, details, WhatsApp the seller. |
| `/login` | One login for everyone: customers use their phone number, staff use their staff ID. |
| `/signup` | Create a customer account as a private person or a car dealer. |
| `/account` | Customer area: details, document uploads, send for verification, my cars, change password. |
| `/sell` | Post a car. Only for verified accounts; cars wait for staff approval. |
| `/dealers`, `/dealer?id=…` | Dealer list and dealer pages. Verified dealer accounts get a page automatically. |
| `/admin` | Staff panel (see roles below). |

## Verification

- **Private person:** full name, city, ID type and number, photo of the ID, selfie holding the ID (back of ID optional).
- **Car dealer:** business name, TIN, business licence number, address, business licence, TIN certificate, owner/manager ID and selfie (BRELA certificate optional).
- A manager or admin opens the account in **Accounts to verify**, views the documents, calls or WhatsApps the number, ticks **Phone confirmed** and **Documents checked**, then **Verifies**, **Rejects** (with a message the customer sees) or **Suspends** (also takes their cars down).

## Staff roles

| | Admin | Manager | Staff |
|---|---|---|---|
| Approve, feature, mark cars sold; manage dealers | ✅ | ✅ | ✅ |
| Delete cars and dealers | ✅ | ✅ | ❌ |
| Verify, reject, suspend customer accounts; view documents; reset customer passwords | ✅ | ✅ | ❌ |
| Delete customer accounts | ✅ | ❌ | ❌ |
| Create and manage staff IDs | ✅ | ❌ | ❌ |

The first visit to `/admin` on an empty database shows a one-time **Create the admin account** screen protected by the setup key (`ADMIN_PASSWORD`).

## How it is built

- Plain HTML/CSS/JS pages, no build step. Shared code: `assets/app.js`, `assets/style.css`.
- Vercel Functions in `api/`: `listings`, `submit`, `account` (sign up, login, customer actions), `admin` (staff actions), `photo` (serves car photos).
- Data in Postgres (Neon) in two tables, `tcd_records` and `tcd_files`, created automatically (`lib/db.js`). Staff and customer records and ID documents are encrypted (AES-256-GCM, key from `SESSION_SECRET`); passwords are scrypt hashes.

## Settings

- **WhatsApp number, email, location:** `config.js`
- **Our own stock:** `cars.js`
- **Environment variables on Vercel:** `DATABASE_URL` (Neon), `SESSION_SECRET` (signs sessions and encrypts data; changing it logs everyone out and makes existing accounts unreadable), `ADMIN_PASSWORD` (one-time setup key).

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
