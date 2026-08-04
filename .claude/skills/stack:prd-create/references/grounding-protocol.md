# Grounding Protocol — hierarchy first, never invent

For a BrowserStack-product PRD, the primary grounding is the **source-of-truth hierarchy** in
`references/source-of-truth.md` (docs → stack-product → Confluence), consulted proactively.
The user also supplies free-form context — a folder, loose files, URLs, pasted notes, an
optional BRD — which is reconciled _against_ that hierarchy, never discarded. There is **no
required folder schema and no config file.** This file covers the parts that aren't the
hierarchy itself: extraction, gaps, and the never-invent rule.

## 1. Resolve context

- Read everything the user passed with the request (paths, files, links, notes) and any
  `--brd`.
- If **no** context path was given, **auto-detect**: look for a `prd-kb/`-like folder near
  the working directory. Then **confirm**: show what was found and ask the user to confirm
  or supply a path. Never guess silently and proceed.

## 2. Extract what a good PRD needs

From the provided context, pull: personas, success metrics + baselines, competitors,
product surfaces, constraints, prior/related docs.

## 3. Sources: hierarchy is proactive; everything else is opt-in

The three **source-of-truth tiers** (docs clone, the installed product KB `.claude/knowledge/product/<product>/`, the product's
Confluence space) **are** consulted proactively — that is their purpose; see
`references/source-of-truth.md`. **Code context** (the product's source repo / its
`stack-domain` KB) is consulted **when necessary** — to verify actual behavior or feasibility —
not proactively (it's the most expensive source). **Other** live sources (Jira, BigQuery,
Amplitude, arbitrary Confluence spaces outside the product) stay opt-in — pull only if the user
pointed at them (a link, an ID, or an explicit "pull from …"). When any source is down or
access-restricted, record the gap (below) and fall back down the hierarchy rather than blocking.

## 4. Handle gaps — ask, then tag, never invent

For knowledge a strong PRD needs but the context lacks:

- **deep**: ask the targeted question and insist on an answer.
- **standard**: ask the few highest-value questions; tag the rest.
- **lite**: skip the questions; tag the gaps.

Anything still unknown is tagged inline, never fabricated:

- `[ASSUMPTION: <what you assumed and why>]`
- `[TBD — owner: <who must resolve it>]`

**Never invent numbers, customer names, or competitor claims.** A tagged gap is always
preferable to a confident fabrication. The closing report counts open tags.

## 5. Code references — SHA-pinned GitHub permalinks

When a grounded fact or a PRD requirement cites code, reference it as a **GitHub permalink pinned to
a commit SHA**, rendered as a markdown link whose text is `file → function/symbol` so the doc stays
skimmable:

`[session_launcher.rb → launchSession](https://github.com/browserstack/railsApp/blob/<sha>/app/services/session_launcher.rb#L120-L145)`

The SHA freezes the file, so the line anchor never rots. The anchor may be a **single line**
(`#L120`) or a **range** (`#L120-L145`) — both are fine because the SHA pins them. What stays banned
is a **bare, un-pinned line number** (`foo.rb:120` with no permalink) and a **fabricated SHA or line
number** — build the link only from a real, resolvable commit.

**Resolve the SHA** (cheapest source first — no full clone needed):

- Grounded via a `stack-domain-<repo>` KB → use `source.repo` + `source.commit` from that stack's
  `stack-harness.yml`.
- Grounded via a read-only clone → the clone's HEAD: `git -C <clone> rev-parse HEAD`.
- Otherwise pin the current state remotely → `gh api repos/<owner>/<repo>/commits/<branch> --jq '.sha'`.

**Build / verify with `gh`** (so the link is never invented):

- `gh browse -R <owner>/<repo> -n -c <sha> <path>:<startLine>` prints the canonical permalink, or
- construct `https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<a>-L<b>` and confirm it resolves
  with `gh api repos/<owner>/<repo>/contents/<path>?ref=<sha>`.

**Line anchor honesty:** add the anchor — single `#L<n>` or range `#L<a>-L<b>`, whichever matches the
citation — only when you have actually seen those lines; if you know the file at the SHA but not the
exact line(s), link the file with no anchor.

**Narrow fallback (rare):** if a permalink genuinely can't be produced — `gh`/network unavailable,
repo not accessible, or the exact file was never located — cite `file → symbol` as plain text and
tag it `[TBD — link: <file>]`. This is the exception, not a co-equal path.

This applies to every code citation the skill produces — grounding notes, current-behavior claims,
and the API-surface / data-model / functional-requirement sections.
