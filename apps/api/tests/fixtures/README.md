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
SEANSAI_CONTACT=https://github.com/zygispr/Seansai npm run fixtures:capture -- <sourceId>
```

The capture log below records when each source was captured. In fixture mode the API uses the
latest capture instant as its clock (unless `FIXTURE_NOW` is set), so "today" and "already
started" match the saved data.

## Source notes

- **Cinamon** — `cinamon-mode: page-state`. The page API
  (`/api/page/home?cinema_id=77139293&timezone=Europe/Vilnius&locale=lt`) answers with JSON, but
  it holds only today's remaining sessions (the same data as the page state), so the adapter reads
  today's sessions from it and declares the limitation `today-only`. Sessions carry no link of
  their own (the site opens them in its script), so tickets link to the Mega schedule page.
- **Fliko sites** (Atlantis, Garsas, Spindulys, Minija) — each `urls.json` lists the movie list
  plus eight movie pages; in fixture mode the other movies answer "not found" and are skipped.
  HTML fixtures are saved without their inline `<style>` contents (megabytes of CSS no adapter
  reads).
- **Forum** — not captured yet: on 2026-10-30 `https://restapi.forumcinemas.lt/robots.txt`
  answered HTTP 500 to the capture client, which RFC 9309 treats as "disallow everything".

<!-- capture-log:start -->
| Source | Captured at (UTC) |
| --- | --- |
| apollo | 2026-10-30T17:39:42.136Z |
| atlantis | 2026-10-30T17:45:40.919Z |
| cinamon | 2026-10-30T17:41:11.578Z |
| garsas | 2026-10-30T17:45:56.804Z |
| minija | 2026-10-30T17:46:21.519Z |
| pasaka | 2026-10-30T17:39:44.737Z |
| romuva | 2026-10-30T17:39:49.023Z |
| skalvija | 2026-10-30T17:39:47.634Z |
| spindulys | 2026-10-30T17:46:06.218Z |
| vue | 2026-10-30T17:39:50.105Z |
<!-- capture-log:end -->
