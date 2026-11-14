# Red Chilly Portal

Guest site and staff portal for Red Chilly Restaurant & Banquet Hall, Gorakhpur: room booking, self check-in, QR dining, and the staff consoles for bookings, rooms, kitchen orders, menu and analytics.

One Next.js 15 app (App Router) serves both the UI and the API (`src/app/api`), backed by MongoDB. It deploys to Vercel as-is.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

Generate a JWT secret with `npm run generate-jwt`.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGO_DB_URI`, `MONGO_DB_NAME` | yes | MongoDB connection |
| `JWT_SECRET` | yes | Signs staff sessions (32+ characters) |
| `TOKEN_EXPIRES_IN` | no | Session lifetime, default `12h` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Enables "Continue with Google" on the staff login. The button is hidden unless both are set |
| `ADMIN_GOOGLE_EMAILS` | no | Comma-separated Google accounts allowed in as admin |
| `APP_URL` | no | Public origin for OAuth redirects. Defaults to the request origin |

### Google sign-in and roles

Anyone with a verified Google account can sign in from the site header. Their name, email and phone then prefill the booking, banquet and contact forms, and are saved after a successful submit.

1. In Google Cloud Console create an OAuth client (Web application).
2. Add the authorised redirect URI `https://<your-domain>/api/auth/google/callback` (and `http://localhost:3000/api/auth/google/callback` for development).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The sign-in buttons stay hidden until both are set.

Accounts live in the `portal_users` collection of your database, created on first sign-in:

```json
{ "email": "asha@example.com", "name": "Asha Verma", "phone": "+919812345678",
  "roles": [], "outlets": ["all"], "isActive": true }
```

A new account has no roles, so it is a guest. To give someone staff access, edit that document (kept apart from any existing `users` collection in a shared database):

| `roles` value | Access |
| --- | --- |
| `"admin"` | everything |
| `"kitchen"` | orders, menu items |
| `"rooms"` | bookings, rooms and tables |

`roles` is an array, so `["rooms", "kitchen"]` combines them. `outlets` limits a user to specific branches (`["all"]` for no limit). Role changes take effect on the next request, with no need to sign out and in. Set `"isActive": false` to lock an account out immediately.

`ADMIN_GOOGLE_EMAILS` bootstraps the first admin: those addresses always hold the `admin` role, so you can sign in once and manage everyone else from the database.

### Profile, bookings and saved details

Signed-in guests get a **My profile** page (`/profile`) with:

- **Upcoming and past bookings**, matched by the booking's account link (bookings made while signed in) or by the account's verified Google email. Phone numbers are never used to match, because they are unverified.
- **Start check-in** on any confirmed upcoming booking. It opens the online check-in for that booking without asking for the last name again.
- **Invoices:** once a booking is checked out, its owner can open the same invoice staff print (charges, itemised food, requests, rooms, every guest's verification) from the Past tab and print it. It is only served to the booking's owner, and only after check-out.
- **Saved details** for autofill: name, phone, an ID document (type, number, photo) and a signature. The ID number, photo and signature are encrypted at rest (AES-256-GCM) and returned only to their owner. Set `PROFILE_ENCRYPTION_KEY` so they stay readable if `JWT_SECRET` is ever rotated.

### Ordering during a stay

A signed-in guest whose booking is **checked in** with a room assigned can order straight from the menu: the room is filled in automatically, with no QR scan. Guests with several rooms get a room chooser. A scanned QR code always wins, and signed-out visitors keep the QR flow.

Signing out clears everything stored in the browser (account, room, cart, cached data) except the light/dark theme. Sessions are stateless tokens, so signing out does not invalidate a token copied elsewhere; it expires after `TOKEN_EXPIRES_IN`.

## Deploying to Vercel

1. Import the repository; the Next.js preset is detected automatically.
2. Add the environment variables above.
3. In MongoDB Atlas, allow Vercel's egress (Network Access `0.0.0.0/0`, or use Atlas's Vercel integration).

Request bodies to API routes are limited to about 4.5 MB on Vercel, so images are compressed in the browser before upload.

## Layout

```
src/app/            pages and API route handlers (app/api/**)
src/components/     UI primitives, site shell, admin shell, feature components
src/server/         server-only code: env, Mongo, sessions, domain services
src/lib, src/hooks  client helpers
```

The public API lives under `/api/public/*`, staff endpoints under `/api/admin/*` (Bearer token, role checked per route), and sign-in under `/api/auth/*`.

## QR campaigns and rewards

Integrated from `SatyamAnand98/qr-code-generator-redchilly`, commit `6aa1a01`
(latest `main` at integration). The original services and standalone tools live
in `src/server/qr-redirect`; a serverless response adapter exposes them as Next.js
route handlers. No separate QR deployment is required.

| URL | Function |
| --- | --- |
| `/get?key=order-qr-code-reward` | Loads the active MongoDB campaign and redirects to WhatsApp |
| `/<campaign-key>` | Original clean campaign URL, including nested campaign keys |
| `/update?key=…&text=…` | Legacy message update alias, requires portal admin Bearer authorization |
| `/host` | Redirects to the dashboard QR generator |
| `/cleanup` | Redirects to the dashboard cleanup tab |
| `/auth/login` | Retired QR login endpoint (410); use the portal login |
| `/reward/create`, `/reward/verify` | Generate and redeem reward QR codes |
| `/reward/status`, `/reward/customer`, `/reward/options`, `/reward/cleanup` | Status, customer history, reward options and cleanup |
| `/admin/rewards` | Campaign/message editor, QR generator, records, customers, options, settings and cleanup |
| `/order-online` | Original Zomato/Swiggy landing page; the portal homepage stays at `/` |

Original `/api/get`, `/api/update`, `/api/auth`, `/api/reward?action=…`,
`/api/host` and `/api/cleanup` aliases are supported. Explicit portal routes take
precedence over the campaign catch-all. Reward action URLs use the path action
even if a conflicting `action` query parameter is supplied.

### Configuration and existing data

The QR tools use the portal's own database (`MONGO_DB_URI` and `MONGO_DB_NAME`). Campaigns are
stored in the `qr_codes` collection (set in `src/server/qr-redirect/config.mjs`) and the default
`order-qr-code-reward` campaign needs `phone` and `text` fields.

QR administration uses the portal administrator session, including current role
and account activation checks. Because this data is shared across branches, an
administrator must have access to all branches. The admin menu opens native
editing forms; no separate host login, password, or QR token is required.
`HOST_USERNAME`, `HOST_PASSWORD`, `REWARD_ADMIN_TOKEN` and `UPDATE_TOKEN` are no
longer used. Old QR tokens do not authorize either the dashboard API or legacy
management aliases. Only campaign redirects, reward verification and active
reward options remain public.

Use **QR rewards** in the staff menu to:

- Create, edit, activate/deactivate and delete WhatsApp campaigns, including the
  destination phone and message. Renaming/deleting a key can break printed links.
- Generate QR rewards, download/copy/share a branded image and share on WhatsApp.
- Search QR records, edit pending rewards without changing their verification
  URL, cancel them, and delete records. Completed/in-progress redemptions cannot
  be edited. Customer generation history remains as originally recorded.
- View customer order/reward history and correct names or visit counts. Manual
  visit corrections do not issue rewards or rewrite reward history.
- Create, edit, activate/deactivate and delete reward options. Labels saved into
  already-issued rewards remain unchanged unless a pending reward is edited.
- Edit default expiry, storage limit, deletion after redemption, the public QR
  origin, the WhatsApp sharing template and Zomato/Swiggy URLs.
- Run standard cleanup or explicitly confirm deletion of all reward records.

The dashboard API is `POST /api/admin/qr`. Settings are stored in `qr_settings`
in the QR database, with environment defaults used until settings are saved.
Database connection credentials and collection names stay in server environment
variables. Set those in the portal's Vercel project before deploying; local
`.env.local` settings are not deployed automatically.

Optional collection names and reward settings are listed in `.env.example`.
Reward customers default to `reward_customers` and QR user history to `users`,
separate from portal accounts in `portal_users`.

Generated verification URLs use the dashboard public base URL first, then
`DEV_PUBLIC_BASE_URL`/`PROD_PUBLIC_BASE_URL`, then
`PUBLIC_BASE_URL`, then `APP_URL`, then the incoming request origin. Remove old
host overrides or set the production override to `https://redchilly.in` when
moving the app. Existing QR images with another hostname still require that
hostname to serve or forward `/reward/verify`.

Rewards support discounts and visit targets, order/source history, expiry and
optional deletion on redemption. Redemption atomically claims a code before
awarding it, preventing simultaneous scans from awarding it twice. If a database
write fails after the claim, the record stays `redeeming` for staff investigation
rather than becoming redeemable again automatically.

Run `npm run test:qr` with Node 22.3+ for isolated integration checks (MongoDB is
mocked; live records are never modified by the tests). Also run `npm run typecheck`
and `npm run build` when changing these routes.

## Data model: links by `_id`

Every link between records is the other record's `_id` (an ObjectId), never a name or a key:

| Record | Links to |
| --- | --- |
| `bookings`, `rooms_tables`, `menu_categories`, `menu_items`, `orders`, `room_pricing_rules` | `outlet_id` → `outlets._id` |
| `menu_items` | `category_id` → `menu_categories._id` (the category's name is looked up, not stored) |
| `orders` | `booking_id` → `bookings._id`, `room_table_id` → `rooms_tables._id`, `placed_by.id` → the staff account |
| `order_items` | `order_id` → `orders._id`, `menu_item_id` → `menu_items._id` |
| `bookings` | `room_id`, `room_ids[]`, `rooms_allocated[].room_id`, `stay_segments[].room_id`, `checkin_details.assigned_rooms[].id` → `rooms_tables._id` |
| `configs`, `portal_users` | `outlets[]` → `outlets._id` (or `"all"`) |
| `app_config` | `sets[].outlets[]`, `variables[].outlets[]` → `outlets._id` |

A branch's `location_key` is only its public name (URLs, QR links, the screens and sign-in sessions). The server turns it into
the `_id` at the edge (`src/server/utils/outlets.ts`) and back again in responses, so the API the screens use did not change.
Renaming a key (`scripts/rename-outlet-key.mjs`) therefore changes nothing else.

Reward customers are identified by **phone number** on purpose; that is a person's identity, not a link to another record.

### Moving an older database to this layout

```
node --env-file=.env.local scripts/migrate-to-object-ids.mjs <newDatabase>           # dry run: reports only
node --env-file=.env.local scripts/migrate-to-object-ids.mjs <newDatabase> --apply   # copies into the new database
MONGO_DB_NAME=<newDatabase> node --env-file=.env.local scripts/create-indexes.mjs --apply
```

The old database is only read, so it stays as the way back. The report lists any reference that already pointed at a
deleted record. Then set `MONGO_DB_NAME` to the new database and restart.

## Phone numbers

Every phone number is stored with its country dial code, as `+` and digits only (`+919876543210`). The phone fields show a
country picker (flag, name and dial code) beside the number; `src/lib/phone.ts` reads and checks numbers, and
`src/components/ui/phone-input.tsx` is the field. Indian numbers need 10 digits starting 6 to 9; other countries 4 to 14 digits
after the code. Numbers saved in the old style (10 digits, `+91 …`) are read as Indian. To convert an older database:

```
node --env-file=.env.local scripts/migrate-phones-e164.mjs          # dry run
node --env-file=.env.local scripts/migrate-phones-e164.mjs --apply
```

Reward and campaign numbers (`users`, `reward_customers`, `reward_qr_codes`, `qr_codes`) are kept as digits starting with the
country code, which is how the QR tools have always stored them.

## SQL database (Turso)

Campaign visit tracking (a log of every scan, summed and grouped for the analytics) is kept in Turso rather than MongoDB.
Set `APP_TURSO_URL` and `APP_TURSO_TOKEN`; the table is created on first use. Without them, visits fall back to MongoDB.
`APP_TURSO_API_TOKEN` is only used to show the monthly rows read and written under Settings → Storage & usage.

## Identity documents and the printed invoice

Under Settings → Configuration an administrator chooses which documents guests can give and how many photos each needs
(**Documents**), and what the printed invoice shows, the paper size and the photo sizes for every branch or chosen ones
(**Invoice**, with a preview of the printed sheet for any number of guests).

## Laundry

Under **Laundry** in the staff portal (`/admin/laundry`), for administrators and staff given the **Laundry** role in Access:

- **Items and prices** is the list of things that go to the laundry (bed sheet ₹15, pillow cover ₹7, …). Only an administrator edits it.
- **Give laundry** records a day's batch: how many of each item went out, at that day's prices (a later price change does not alter past records).
- **Received** is added on each day laundry comes back (it can come back in parts). Whatever has not come back is **missing**, listed per item and day on the **Missing items** tab, and stays listed after the batch is settled (as written off).
- **Settle** works out what is owed for what came back, with an optional reduction per item and for the total, shown as an adjustment on the settlement (for example 8 sheets and 19 covers received = ₹253, less ₹50 = ₹203 paid).
