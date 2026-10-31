# Contract: Hosting configuration

**Feature**: [../spec.md](../spec.md)

What the deployment promises to the platform and to visitors. Changes to these require a spec
change.

## `vercel.json`

```jsonc
{
  "regions": ["fra1"],                                   // Hobby: one region, near Lithuania and the database
  "services": {
    "api": { "root": "apps/api", "framework": "fastify", "entrypoint": "index.ts" },
    "web": {
      "root": "apps/web",
      "framework": "vite",
      "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],   // FR-002 deep links
      "headers": [ /* CSP, X-Content-Type-Options, Referrer-Policy on every page (FR-012);
                      immutable caching for /assets/* */ ]
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },     // FR-001
    { "source": "/(.*)", "destination": { "service": "web" } }
  ],
  "crons": [{ "path": "/api/v1/cron/daily", "schedule": "0 22 * * *" }]  // FR-004, Hobby: at most daily
}
```

- **No bindings.** No service calls another.
- **Fallbacks** (research §3, §6):
  - If `crons` is rejected in services mode, `.github/workflows/daily-refresh.yml` calls the same
    URL on the same schedule with the secret.
  - If `regions` is rejected, the region is set in the project settings.

## Environment variables (Vercel project)

| Variable             | Environments          | Set by                         | Purpose                                         |
| -------------------- | --------------------- | ------------------------------ | ----------------------------------------------- |
| `TURSO_DATABASE_URL` | Production, Preview   | Turso integration (or by hand) | shared data store (FR-003)                      |
| `TURSO_AUTH_TOKEN`   | Production, Preview   | Turso integration (or by hand) | database credentials (FR-013)                   |
| `CRON_SECRET`        | Production            | maintainer, `openssl rand -hex 32` | protects the refresh trigger (FR-008)      |
| `SEANSAI_CONTACT`    | Production, Preview   | maintainer                     | sent in the User-Agent to cinemas (001)         |
| `DISABLED_SOURCES`   | Production (optional) | maintainer                     | kill switch (001)                               |

- Previews share production's database (spec Assumptions).
- Previews never refresh: crons run only in production, and `CRON_SECRET` isn't set for Preview.
- None of these values are committed (FR-013).

## API response caching (change to feature 001's public API)

List endpoints (`/cities`, `/movies`, `/movies/:id`, `/movies/:id/screenings`) change from
`Cache-Control: public, max-age=300` to:

```text
Cache-Control: public, max-age=300, s-maxage=300
```

- Browsers: unchanged. Vercel removes `s-maxage` before the response reaches the browser.
- Vercel CDN: caches each URL, including its query string, for up to 5 minutes (research §5).
- Self-hosted: no effect.
- `/health` and the cron route stay `no-store`.

## Free-plan guardrails (FR-011)

- Vercel team on **Hobby**; no Pro trial started.
- Turso on the **Free** plan, with no payment method needed or added.
- Cron schedule no more often than daily.
- No Blob, no log drains, no paid Marketplace products.
