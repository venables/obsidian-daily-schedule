# Daily Schedule

An Obsidian plugin that shows today's calendar events in a sidebar pane and
turns any event into a pre-filled meeting note with one click.

- Pulls events from one or more **ICS calendar URLs** (Google Calendar, Apple
  Calendar, Outlook, Fastmail, etc.)
- Expands recurring events for today (handles `RRULE`, including per-occurrence
  start/end times)
- Click an event to create a meeting note at
  `{base}/YYYY/MM/YYYY-MM-DD - Title.md` — or re-open it if it already exists
- Resolves attendees to `[[Wikilinks]]` by matching email addresses against
  `email:` / `emails:` frontmatter in your people folders
- Filters noise (commute, lunch, OOO, anything you list) by title keywords
- Highlights the currently-running event, fades past ones
- Auto-refreshes on a configurable interval (5–60 min)

## Installation

This plugin is not in the community plugin directory yet. Pick one of the
install paths below.

### Option A — BRAT (recommended for end users)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) lets you install and
auto-update plugins directly from a GitHub repo.

1. Install the **Obsidian42 - BRAT** plugin from the community plugins browser.
2. In BRAT settings, click **Add Beta plugin** and paste this repo's URL (e.g.
   `https://github.com/venables/obsidian-daily-schedule`).
3. Enable **Daily Schedule** in Obsidian's Community Plugins list.

BRAT will keep it updated whenever you push a new release.

### Option B — Manual build from source

Requires [bun](https://bun.sh).

```bash
git clone https://github.com/venables/obsidian-daily-schedule.git
cd daily-schedule
bun install
bun run build
```

This produces a `dist/` folder with everything the plugin needs. Copy it into
your vault:

```
<vault>/.obsidian/plugins/daily-schedule/
├── main.js
├── manifest.json
└── styles.css
```

Or symlink the `dist/` folder directly:

```bash
ln -s /path/to/daily-schedule/dist <vault>/.obsidian/plugins/daily-schedule
```

Then reload Obsidian and enable **Daily Schedule** under Settings → Community
plugins.

### Option C — Manual release download

Once a tagged release exists, download `main.js`, `manifest.json`, and
`styles.css` from the release's Assets and drop them into
`<vault>/.obsidian/plugins/daily-schedule/`.

## Configuration

Open **Settings → Daily Schedule**.

### Calendars

Click **Add calendar** and provide:

- **Name** — e.g. "Work", "Personal"
- **ICS URL** — a secret `.ics` feed URL (see below)
- **Accent color** — shown as the left border on event cards

> **Privacy note:** ICS feed URLs are effectively read credentials for your
> calendar. Anyone with the URL can read all your events. Treat them like
> passwords — don't commit them to git, don't paste them in screenshots.

**Getting an ICS URL from Google Calendar:** Google Calendar → Settings → pick
the calendar → _Integrate calendar_ → **Secret address in iCal format**.

**Apple / iCloud:** Calendar app → right-click a calendar → _Share Calendar_ →
Public Calendar → copy the `webcal://` URL and change `webcal://` to `https://`.

### Meeting Notes

- **Meeting note path** — base folder (default `meetings`). The plugin
  auto-creates `YYYY/MM/` subfolders.
- **My emails** — comma-separated. Your own addresses are stripped from attendee
  lists so you're not "meeting with yourself".

### Display

- **Refresh interval** — how often to re-fetch calendars (5 / 10 / 15 / 30 / 60
  min).
- **Ignore patterns** — comma-separated title substrings (case-insensitive).
  Events whose titles contain any of these are hidden. Default:
  `commute, lunch`.

### People Lookup

- **People folders** — comma-separated folders to scan for person notes. Each
  person note should have an `email` (or `emails`) property in its frontmatter:

```markdown
---
type: person
email: jane@example.com
---
```

Or multiple:

```markdown
---
email:
  - jane@example.com
  - jane@personal.com
---
```

When an event has an attendee whose email matches, the attendee is rendered as a
wikilink to that note. Unmatched attendees fall back to their display name or
email local-part.

## How a meeting note looks

Clicking an event creates a note like:

```markdown
---
type: meeting
date: 2026-04-15
title: "Design review"
attendees:
  - "[[Jane Doe]]"
  - "[[John Smith]]"
tags:
  - meetings
---

# Design review

**Date**: 2026-04-15 **Attendees**: [[Jane Doe]], [[John Smith]] **Location**:
Zoom

## Agenda

## Notes

## Action Items

- [ ]
```

If a note at that path already exists, it's opened instead of overwritten.

## Commands

- **Open daily schedule** — reveals the sidebar view
- **Refresh daily schedule** — manual re-fetch

There's also a ribbon icon (calendar-clock) for opening the view.

## Development

```bash
bun install
bun run dev        # tsdown watch mode
bun run build      # one-shot production build
bun run check      # format:check + lint
bun run fix        # format + auto-fix lint
```

For the fastest dev loop, symlink (or clone directly into)
`<vault>/.obsidian/plugins/daily-schedule/` and install the
[Hot Reload plugin](https://github.com/pjeby/hot-reload) — it will pick up
rebuilt `main.js` automatically. Create an empty `.hotreload` file in the plugin
folder to opt in.

### Project layout

```
src/
├── main.ts       plugin entrypoint, commands, refresh timer
├── view.ts       sidebar ItemView + event rendering
├── settings.ts   settings tab + calendar add/edit modal
├── calendar.ts   ICS fetch, RRULE expansion, filtering
├── meeting.ts    meeting note path + content builder
├── people.ts     email → person-note frontmatter lookup
└── helpers.ts    date/time/string utilities
```

Built with [tsdown](https://tsdown.dev/) (bundling),
[oxlint](https://oxc.rs/docs/guide/usage/linter.html) + oxfmt (lint/format), and
[`ts-ics`](https://www.npmjs.com/package/ts-ics) for ICS parsing.

## License

MIT
