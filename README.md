# ArenaPot — Tournament buy-ins with XLM, split for the pot

ArenaPot is a tournament entry app: an organizer creates tournaments with a fixed
**buy-in (testnet XLM)**, players register and **Enter** a tournament, and every
buy-in flows through a [Paiflow](https://beta.app.paiflow.xyz) `Receive → Split`
smart-contract deployment that splits it automatically:

- **90% → the Arena vault** — the prize-pool custodian (`FREELANCER_ADDRESS` in `.env`)
- **10% → a community fund** (`COMMUNITY_ADDRESS` in `.env`)

An entry is only marked **paid** after both payouts are verified on-chain (receipt
`SUCCESS` + matching payout events). Demo-grade, testnet-only.

> Testnet only. Never use mainnet funds or real player funds for this exercise.

---

## How the pieces map

| Paiflow concept | ArenaPot |
|---|---|
| Shop | Arena vault (`FREELANCER_ADDRESS`) — holds the prize pot |
| Community fund | Community fund (`COMMUNITY_ADDRESS`) |
| Customer | Player paying a buy-in (their Freighter wallet) |
| SDK prepare / sign / submit | `POST /api/checkout/prepare` → Freighter → `POST /api/checkout/submit` |
| Receipt + event verification | `GET /api/checkout/status/:entryId` |
| Interrupted payment recovery | **Check payment** button on each entry |

## Files

```
ArenaPot/
├── index.html                  # App screens + payment modal
├── app.js                      # Tournament/entry logic + XLM payment module (browser)
├── style.css                   # Design system
├── server.js                   # Node 22 server: Paiflow SDK, verify, recover
├── package.json                # ESM ("type": "module"), name "arenapot"
├── .env.example                # Copy to .env and fill in
├── .env                        # Your real values (git-ignored)
├── vendor/freighter-api.min.js # Freighter bridge for the browser (no build step)
└── README.md                   # This file
```

---

## Run it

Requires **Node ≥22.22.2 <23** (check with `node --version`). Dependencies are
already installed (`node_modules` is included), so no `npm install` is needed.

```bash
cd ArenaPot
npm start
```

On boot the server:

- discovers the Paiflow deployment and verifies the configured UUID is visible
  with your token,
- checks `capabilities.network === "testnet"` and that `execute` is exposed,
- then serves the app at **http://localhost:3002** (presentation deck at
  **http://localhost:3002/presentation.html**).

Stop it with `Ctrl+C`.

## 90-second demo script

1. **(0:00)** `npm start` — point the browser at http://localhost:3002. Show the
   hero: every buy-in splits 90% vault / 10% fund.
2. **(0:10)** In **Players**, add two players: e.g. *Nova "nova_kid"* and
   *Rin "rin_takeover"*.
3. **(0:25)** In **Tournaments**, create **Friday Frenzy** with a **10 XLM** buy-in.
4. **(0:35)** Click **Enter** on the row, pick a player → the entry is created and
   the payment review opens: TESTNET badge, 10 XLM, 9.0 → vault, 1.0 → fund.
5. **(0:45)** **Approve & prepare payment** → confirm in Freighter → watch the
   status poll: `SUCCESS` + payout events → the entry flips to **paid**
   automatically and the pot total grows.
6. **(1:00)** Open the tournament **View** modal: entries with statuses and the
   pot so far (90% of paid buy-ins). Point at **Follow the money** for live
   vault/fund totals straight from the ledger, and the **Activity** feed with the
   tx hash link.
7. **(1:15)** Killer detail: click **Check payment** on a paying entry — recovery
   re-verifies the *original* transaction and never re-sends money.

## Environment variables (`.env`)

| Variable | What it is |
|---|---|
| `PAIFLOW_BASE_URL` | Paiflow API base URL (`https://beta.app.paiflow.xyz`) |
| `PAIFLOW_DEPLOYMENT_ID` | UUID of your confirmed Receive → Split deployment |
| `PAIFLOW_API_TOKEN` | Developer token (`pfd_...`), **Read and operate** — server-side only, never in the browser |
| `FREELANCER_ADDRESS` | The 90% recipient — presented in the UI as the **Arena vault** (prize pool custodian) |
| `COMMUNITY_ADDRESS` | The 10% recipient — the community fund |
| `PORT` | Server port — **3002** for this app (3000/3001 belong to other apps) |

The two recipient addresses must match the percentages configured in the Paiflow
deployment (90% + 10% = 100%). Restart the server after any `.env` change.

## Sharing it online (cloudflared tunnel)

To demo from another machine or let Freighter approve an `https` origin, expose
the local server with a free Cloudflare quick tunnel:

```bash
cloudflared tunnel --url http://localhost:3002
```

It prints a `https://....trycloudflare.com` URL — open that instead of localhost
(approve the tunnel origin in Freighter when it prompts).

## Payment flow (what "Enter" does)

1. Player clicks **Enter** on a tournament → entry record created (permanent entry
   number) → payment review opens.
2. Freighter connects and returns the player's public address.
3. Server calls `deployment.execute.prepare({ from, amount })` and **saves the
   original preparation** — a repeated prepare returns the same one, never a new
   payment (idempotent per entry).
4. Freighter signs the **original XDR** with the testnet passphrase.
5. Server verifies the signed body hash matches the saved original (changed bodies
   and fee-bump wrappers are rejected), then submits with `wait: false`.
6. App polls `GET /api/checkout/status/:entryId`, which reads the receipt and
   events for the **original hash** and checks both payouts (90%/10% in stroops,
   ±1 stroop).
7. Only after verified `SUCCESS` is the entry marked **paid**. A `200 OK` or
   `PENDING` alone never marks it paid.

## Recovery ("Check payment")

Every entry with payment activity gets a **Check payment** button. It re-queries
the *original* transaction and follows a strict recovery table:

| Observed | App behaviour |
|---|---|
| SUCCESS + matching payouts | Marks entry paid; never re-sends |
| PENDING / UNKNOWN / errors | Keeps the original record; check the original hash again |
| Confirmed FAILED | Keeps the failed receipt; fix cause before a deliberate retry |
| Expired preparation / NOT_FOUND | Retains the record; asks you to contact support — no silent replacement |
| Missing/delayed events | Stays pending verification; no new payment is created |

A browser reload during signing loses nothing: the server holds the order,
preparation, envelope and hash (persisted to `orders.json`). If `orders.json` is
gone, the browser's saved hash is re-verified via `POST /api/checkout/verify-tx`.
Never treat a reload (or an error) as permission to pay again.

## Notes & honest limits

- **Amounts** are integer stroop strings server-side (`1 XLM = "10000000"`),
  converted with `BigInt` — no floating point near money.
- **Tournament and entry numbers are permanent** — deleting #2 never renumbers #3.
- **The Arena vault is custodial**: one address, controlled by the organizer's
  key. That's fine for a testnet demo and *not* acceptable for real stakes — a
  production version would custody the pot in a **locked escrow contract** that
  pays winners by preset rules.
- Replace `orders.json` with a real database, add auth + rate limiting on the
  checkout routes, and audit before any mainnet use.

## Troubleshooting quick list

| Symptom | Check |
|---|---|
| `Invalid API token` on boot | Token must be `pfd_` + 64 hex chars |
| `Deployment connection failed` | Deployment UUID, token not expired/revoked, deployment explicitly selected on the token |
| 403 on prepare/submit | Token permission must be **Read and operate** |
| Freighter not responding | Unlocked, app origin approved (`http://localhost:3002` or your tunnel URL), correct account selected, Testnet |
| Insufficient funds / missing account | Fund the player + both recipient accounts via Friendbot |
| 429 rate limit | Respect `Retry-After` |
| PENDING / timeout / reload | Use **Check payment** — never create a new preparation |

When asking for help, share the deployment UUID, transaction hash and safe error
message — **never** the token, secrets or signed envelopes.
