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
| `ADMIN_DEFAULT_PASSWORD` | no | Fallback all-access admin password. Leave unset to disable |
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
