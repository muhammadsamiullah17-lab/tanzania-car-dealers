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

## Selling, search and trust

- **My cars** (in `/account`): edit (goes back to approval), change price (stays live, shows "Price reduced"), mark sold, delete.
- Ads have engine cc, drive, assembly, registered in, previous owners and a features checklist (`lib/adfields.js`).
- **Search** on `/`: ranges, gearbox, fuel, drive, seller type, with photos, inspected only, sorting, pages; filters live in the URL.
- **Car page**: full-screen photos, features, similar cars, Call, Share, ♥ Save, and **Report this ad** with reasons.
- **TCD Inspected**: staff add an inspection (overall /10, nine area scores, mileage/documents/accident checks, notes) from the ad row in admin; buyers see a badge and report.
- **Saved cars** (`/saved`): kept in the buyer's browser, no account needed.
- **Buyer alerts**: "Notify me about new cars like this" saves a search with a WhatsApp number; the admin **Buyer alerts** tab lists new matching cars with a ready WhatsApp message (sending is manual; no SMS/WhatsApp provider is connected).
- **Reports** tab: reports from buyers, resolve with a note.
- **Swahili**: EN/SW button in the header translates the public pages (header, home, search, cards, car page, saved). Strings live in `SW` in `assets/app.js`; pages mark text with `data-t` / `data-tp`.

## Accounts and buying

- The header always shows **Log in**. `/login` takes a phone number (customers) or staff ID; staff go to `/admin`, customers to `/account` (titled **Dealer dashboard** for dealers). Someone already logged in who opens `/login` goes straight to their page.
- Three account types at `/signup`: **buyer** (no documents, active at once), **private seller** and **dealer** (both verified before posting). A buyer can later **Become a seller** from their account.
- Every car page offers two ways to buy: **contact the seller directly** (WhatsApp / call) or **🤝 Buy through Tanzania Car Dealers** (`lib/deals.js`): the buyer (logged in) sends a request with an optional offer; staff manage it in Admin › **Buy requests** (WhatsApp buyer and seller, status, a message the buyer sees, staff-only notes). Buyers follow progress in their account.

## Payments

- Customers (verified accounts) buy **Featured ad** packages (7/14/30 days) for their live cars and, if they are dealers, **Silver/Gold dealer** packages (30 days) at `/pay`, from **My account**.
  - Silver: dealer shown first on the Dealers page with a badge. Gold: the same, plus all the dealer's live cars are Featured.
  - Days stack on top of time already left.
- Two ways to pay, set in Admin › **Payment settings** (managers/admins; Selcom keys admins only):
  - **Lipa numbers** (M-Pesa, Mixx by Yas, Airtel Money, HaloPesa): the customer pays the shown number with the order reference and enters the SMS transaction code; staff check and press **Confirm payment** in Admin › **Payments**. Codes can't be reused.
  - **Selcom** (`lib/selcom.js`): vendor ID, API key, API secret and base URL (stored encrypted; or set `SELCOM_API_KEY`, `SELCOM_API_SECRET`, `SELCOM_VENDOR`, `SELCOM_BASE_URL` in Vercel, which win). Creates an order, pushes a PIN prompt to the phone, and activates when Selcom's order status is `COMPLETED`. The callback `/api/pay?webhook=1` is never trusted on its own: the order is always re-checked with Selcom.
- Orders: `pending` → (`pushed` | `awaiting_check`) → `paid` → `activated`, or `rejected` / `failed` / `cancelled`.

## Import from Japan

- `/japan`: cars staff can source from Japan (stock or auction), filters, an **import cost calculator**, and a **Find me a car** request form for logged-in customers.
- `/japan-car?id=…`: full cost breakdown to Dar es Salaam and an order / "bid for me" button on WhatsApp.
- Admin tabs: **Japan stock** (add/edit cars, photos, status), **Import requests** (follow up customers), **Import settings** (managers/admins: exchange rates, shipping per size, insurance, TRA rates and excise bands, registration, clearing and service fees).
- Estimate (`assets/japan.js`): CIF = FOB + shipping + insurance. Import duty 25%, engine excise (5% up to 2,000cc, 10% above), age excise (0% under 8 years, 18% 8–10, 35% 11–20, 40% over 20) and RDL 2% on CIF; VAT 18% on CIF + duty + excise; Customs Processing Fee 0.6% on FOB; plus registration, clearing and service fees. Defaults from TRA *Taxes and Duties at a Glance 2025/26* and the Finance Act 2026; all editable. TRA's assessment is final.

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
