# Source fixtures

Saved real responses from each cinema source, one folder per source id
(`apollo`, `forum`, `pasaka`, `skalvija`, `atlantis`, `garsas`, `spindulys`, `minija`, `romuva`,
`vue`, `cinamon`). They feed the adapter contract tests and `SOURCES_MODE=fixtures`, so tests and
local runs never contact cinema websites.

Each folder contains:

- `urls.json` — the hand-written list of URLs to capture (absolute URLs; may use the placeholders
  `{today:dd.MM.yyyy}`, `{today:yyyy-MM-dd}` and `{today+14:yyyy-MM-dd}`, filled with today's
  date in Europe/Vilnius). List pages are not followed: list every page the adapter needs.
- `manifest.json` — `{ "<resolved url>": "<file>" }`, written by the capture script.
- `001.json`, `002.html`, … — the saved responses.

Refresh a source deliberately (never in CI):

```bash
SEANSAI_CONTACT=you@example.com npm run fixtures:capture -- <sourceId>
```

The capture log below records when each source was captured. In fixture mode the API uses the
latest capture instant as its clock (unless `FIXTURE_NOW` is set), so "today" and "already
started" match the saved data.

<!-- capture-log:start -->
| Source | Captured at (UTC) |
| --- | --- |
<!-- capture-log:end -->
