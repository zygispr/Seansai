# Quickstart: Validate Free Hosting on Vercel

**Feature**: [spec.md](./spec.md)

How to show that each user story works. §1–§3 run on a laptop. §4–§6 need the Vercel and Turso
accounts. Contracts: [cron-endpoint.md](./contracts/cron-endpoint.md),
[hosting.md](./contracts/hosting.md).

## Prerequisites

- Node.js 24, npm, Vercel CLI ≥ 48.6 (`npm i -g vercel`).
- Docker, for §3 only.
- For §4–§6: a Vercel **Hobby** account and a Turso **Free** account (or the Turso Marketplace
  integration on its Free plan).

## 1. Automated checks (every change)

```bash
npm run lint && npm run format:check && npm run typecheck
npm test                 # includes the new cron, daily-refresh, config and repository tests
npm run test:load        # p95 < 300 ms still holds with the async database client
npm run build && npm run test:e2e
```

Expected: everything passes.

## 2. Both services together under `vercel dev` (US1, US3)

```bash
printf 'SOURCES_MODE=fixtures\nCRON_SECRET=0123456789abcdef0123456789abcdef\n' > .env      # gitignored; delete afterwards
vercel dev --local --listen 3333
```

| Check                                                          | Expected                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| `curl -s 'localhost:3333/api/v1/movies?city=vilnius'`          | JSON movie list (fixture data)                              |
| `curl -s -o /dev/null -w '%{http_code}' localhost:3333/vilnius` | `200` (deep link served by the web service)               |
| `curl -sI localhost:3333/ \| grep -i content-security-policy`   | the CSP header                                              |
| `curl -s localhost:3333/api/v1/cron/daily`                     | `404` with the `not_found` body                             |
| `curl -s -H 'Authorization: Bearer wrong' localhost:3333/api/v1/cron/daily` | `404`                                          |
| `curl -s -H 'Authorization: Bearer 0123456789abcdef0123456789abcdef' localhost:3333/api/v1/cron/daily` | `200`, every source listed, `cleanup` counts   |

Delete `.env` when done.

## 3. Self-hosting still works (FR-015)

```bash
docker build -t seansai .
docker run --rm -p 3000:3000 -e SOURCES_MODE=fixtures \
  -v "$PWD/apps/api/tests/fixtures:/app/apps/api/tests/fixtures:ro" seansai
curl -s localhost:3000/api/v1/health      # "status":"ok", sources healthy
curl -s localhost:3000/ | head -c 100     # the web app's index.html
```

`npm run dev` with `SOURCES_MODE=fixtures` also still works as described in the README.

## 4. First deploy on free plans (US1, US3)

1. Run `vercel link` and create the project on the **Hobby** team.
2. Set up the database:
   - Run `vercel integration add tursocloud` and choose the free `starter` plan.
   - Create two databases: `seansai` connected to Production, and `seansai-preview` connected to
     Preview.
   - If that asks for a paid plan or a card, stop. Create both databases at turso.tech in the EU
     region nearest Frankfurt instead. Then run `vercel env add TURSO_DATABASE_URL` and
     `vercel env add TURSO_AUTH_TOKEN` once per environment, with that environment's database.
3. Add the remaining variables:
   - `vercel env add CRON_SECRET production` with the output of `openssl rand -hex 32`;
   - `vercel env add SEANSAI_CONTACT` with `https://github.com/zygispr/Seansai`.
4. Deploy a preview by pushing the branch or running `vercel deploy`.
   - **Expected**: the build succeeds and `regions` and `crons` are accepted. If not, use the
     fallbacks in [hosting.md](./contracts/hosting.md).
5. `curl <preview>/api/v1/health`.
   - **Expected**: `status: ok`, every source `stale`. This proves the migrations ran on Turso.
   - If Deployment Protection blocks the call, use `vercel curl`.
6. Deploy to production (merge to `main`), then trigger the first load by hand:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<production>/api/v1/cron/daily`
   - **Expected**: `200` with every enabled source `success`.
   - The function's duration in Runtime Logs is well under 300 s.
7. Open the production address on a phone and follow feature 001's journeys:
   - choose a city, then pick a movie;
   - change the date, apply filters;
   - open a ticket link;
   - reload a deep link.
   - **Expected**: the same results as a self-hosted copy (SC-001).

## 5. Daily refresh works without anyone (US2)

- On two consecutive mornings (the release gate), and then on each of the first 7 days (SC-003,
  checked at the one-week review), before 08:00 Vilnius time:
  - Vercel's Cron Jobs tab shows a successful run after 22:00 UTC;
  - `/health` shows each source's `lastSuccessAt` from that night;
  - the site lists today's screenings and none from yesterday (SC-003).
- Kill switch:
  - Set `DISABLED_SOURCES=forum` in Production and redeploy.
  - After the next run, Forum's cinemas are gone from the site, and no Forum request appears in
    that run's logs.
  - Remove the variable afterwards.
- Missed refresh: with Forum disabled for longer than 27 h, the site would flag it. Unit tests
  cover the threshold (§1). Live checking is optional.

## 6. Cost and usage check (US3, SC-002, SC-005)

After a week, and again after the first full month:

- Vercel → Usage: invocations, Active CPU, Provisioned Memory, Fast Origin and Fast Data Transfer
  each under 50% of the Hobby allowance (prorated for a week). No upgrade prompts.
- Turso dashboard: rows read and written, and storage, each under 50% of the Free allowance.
  Plan is Free, with no payment method.
- Responses: `curl -sI '<production>/api/v1/movies?city=vilnius'` twice. The second shows
  `x-vercel-cache: HIT` (CDN caching works, research §5).
