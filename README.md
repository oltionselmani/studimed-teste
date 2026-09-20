# ExamOS

**Know where you stand. Know what to do next.**

ExamOS is an exam readiness system. You tell it about an exam and a target
grade, give it your course material, and it measures how prepared you actually
are — then tells you the one thing to do next.

It is not a study assistant that generates material and hopes. The loop is:

```
create exam → upload material → analyse course → generate diagnostic
     → take or print → grade → find weaknesses → generate study material
     → study → test again → update readiness → adapt plan → full mock
     → final readiness report
```

Everything the app says about where you stand comes out of a deterministic
scoring engine working on your own test results. The model writes questions and
explanations; it never decides how ready you are.

---

## What it does

| | |
|---|---|
| **Create an exam** | Course, date, target grade, current standing, exam weight. A live countdown. |
| **Split it into kolokviums** | An exam sat in parts: each with its own date, topics, weight and result. Everything below is then measured one sitting at a time. |
| **Upload material** | PDF, Word, PowerPoint, plain text, and photos of handwritten notes. |
| **Pick your AI** | Anthropic (Claude) or Google (Gemini), switchable in Settings. Same prompts, same rules, same validation either way. |
| **Analyse the course** | Extracts topics, definitions, formulas, algorithms and terminology — each traced back to the file it came from. |
| **Previous exams** | Analyses past papers you provide, and can run a real web search for public course documentation. |
| **Generate tests** | Diagnostic, targeted practice, mistake re-test, or a full timed mock. Five difficulty levels. |
| **Print or take online** | A clean academic exam paper, or a timed interface with autosave and review flags. |
| **Scan a paper exam** | Photograph the pages; the model transcribes your handwriting, you correct it, then it is graded. |
| **Performance analysis** | Score, topic breakdown, per-question feedback, and what it means. |
| **Readiness** | 🟢 On track · 🟡 Needs attention · 🟠 At risk · 🔴 Significant gap — with every number behind it. |
| **Study plan** | Day-by-day, time-boxed, with a success criterion per task. Rebuilt every time you test. |
| **Study sheets** | Printable revision material built from your own content and your actual mistakes. |
| **Mistake book** | Every question you lost points on, kept with the concept you were missing. |
| **History** | Whether your preparation is actually improving. |
| **Final report** | The last-days readout: what to do, and what to leave alone. |

Interface, generated material and printed documents are available in
**English** and **Shqip**.

---

## Honesty rules

These are not aspirations; they are enforced in code.

**Nothing is invented.** Questions are written from your uploaded material.
Every question stores what it was built from, and the label has to be literally
true — a generated question can never be presented as coming from a professor
or a real past paper. `src/lib/engine/question-validation.ts` rejects a
question that claims a source it does not have.

**Four evidence levels, shown next to every figure.**

| | |
|---|---|
| **Verified** | You provided it, or it has a checkable reference. |
| **Your data** | Calculated from your own test results. |
| **Estimate** | Inferred from what is available. Not a prediction. |
| **Unknown** | Not enough information to determine this. |

**The score is not the model's opinion.** `src/lib/engine/readiness.ts` is
AI-free. It combines recent weighted average, topic coverage, consistency,
trend and time adequacy into a transparent 0–100 figure, and applies a ceiling:
you cannot be told you are "on track" for a grade you are not currently
reaching, however good your coverage and however much time is left.

**No fake predictive accuracy.** The app never says you will get a grade or
quotes a probability. It says your recent practice results are, or are not,
consistent with the level your target requires.

**A sitting is scored on what that sitting examines.** When an exam is split
into kolokviums, readiness for one of them never borrows credit from material
it does not cover: past tests are re-scored over that sitting's topics only,
and questions outside them are dropped rather than counted.

**"Not found" is not "does not exist".** When no past papers are available it
says so, and says explicitly that this does not mean none exist.

**An unreadable answer is never marked wrong.** A scanned answer the model
could not read is excluded from the score and flagged for you to type in.

**Grade conversion is labelled as the app's own default.** The
percentage-to-grade mapping is shown as an ExamOS default, not a university
rule, and you can edit it per exam.

**No key, no invention.** Without an API key the AI features refuse with a
clear message rather than producing placeholder content. The same holds when
the configured provider cannot do what a feature needs: previous-exam research
says the search never ran, which is not the same as finding nothing.

---

## Exams in parts (kolokviums)

An exam does not have to be one sitting. Split it in **Settings → Exam parts**:
give each part a name, a date, the topics it examines and what it is worth, and
the app treats them as separate exams that add up to one grade.

What changes once an exam is split:

- The **countdown** runs to the next sitting, and says which one it is.
- **Readiness, weak topics, generated tests and the study plan** cover that
  sitting's topics only. A test you took earlier is re-scored over just the
  questions in scope — it is neither thrown away nor counted whole.
- A part with no topics of its own covers **whatever no other part claims**, so
  splitting a course in half needs you to list the topics once, not twice.
- Once a part has been sat, record what you got. The requirement for the
  remaining sittings is then worked backwards from your target through the
  weights and the grade already banked:

  ```
  needed = (target − banked − points from the rest of the course) ÷ remaining weight
  ```

  and it says which of those it used. Without weights it falls back to the
  target alone and labels the figure an estimate; with the grading scale set to
  unknown it says so instead of guessing.

A part switcher only appears when there is more than one sitting. An exam you
never split behaves exactly as before.

---

## Running it

### Desktop (Windows, macOS, Linux)

Download the installer from the repository's
[Releases](../../releases) page, or build it yourself:

```bash
npm ci
npm run desktop:win     # ExamOS-Setup-<version>.exe (NSIS wizard)
npm run desktop:mac     # .dmg
npm run desktop:linux   # .AppImage
```

The installers are also built by the **Desktop installers** workflow. It runs
automatically whenever anything affecting packaging changes, and on demand from
the Actions tab; either way the `.exe` is in the run's **Artifacts** section,
which is a zip and needs a GitHub sign-in. Give the manual run a **release tag**
— or push a `v*` tag — and it publishes a GitHub Release instead, where the
installer is a plain download link. The notes list only the installers that run
actually built.

The Windows installer is a standard wizard: choose the folder, then Install.
It is unsigned, so Windows SmartScreen warns on first launch — choose
**More info → Run anyway**.

The desktop app is the same application as the web build, wrapped in Electron.
It shows a splash while its local server starts, then keeps its database in the
OS application-data folder (`%APPDATA%\ExamOS` on Windows), so your data
survives reinstalls. **File → Open data folder** shows you exactly where it is.

Every icon — the installer, the window, the phone home screen, the mark in the
app's own header — is resized from one file, `build/logo-source.png`, by
`npm run icons` (which `npm run build` runs for you). Replacing that file
changes the logo everywhere; nothing in the codebase redraws it.

### Phone (iPhone and Android)

ExamOS installs on a phone as a **progressive web app**: open it in the
browser, then **Share → Add to Home Screen** on iOS or **Install app** on
Android. It gets its own icon and opens full-screen, without browser chrome.

There is **no App Store or Play Store build**, and this repository cannot
produce one: an `.ipa` requires a paid Apple Developer account, a Mac to build
and sign it, and App Store review. The home-screen install is the real path,
not a placeholder for one.

Point the phone at wherever the app is running:

- **Self-hosted or development server** — start it on the network with
  `HOSTNAME=0.0.0.0 npm start`, then open `http://<your-computer-ip>:3000` from
  the phone on the same Wi-Fi.
- **Desktop app** — **File → Share to my phone…** restarts the local server on
  the network, tells you exactly what that exposes and to whom, asks you to
  confirm, then copies the address to the clipboard. By default the desktop app
  listens on loopback only and nothing else on the network can reach it.

Sharing over the network is plain HTTP on your own LAN. Anyone on that network
who has the address can reach the sign-in page, so use it on a network you
trust, and close the desktop app when you are done.

### Development

```bash
npm ci
cp .env.example .env.local     # add ANTHROPIC_API_KEY for the AI features
npm run dev                    # http://localhost:3000
```

### Self-hosted

```bash
npm ci
npm run build
npm start                      # PORT and HOSTNAME are honoured
```

`npm run build` produces a self-contained server under `.next/standalone`.

---

## Configuration

| Variable | Purpose |
|---|---|
| `EXAMOS_PROVIDER` | `anthropic` or `gemini`. Optional: fixes the provider for this installation and removes the choice from Settings. |
| `ANTHROPIC_API_KEY` | Key for the Anthropic provider. Can also be set in Settings, which stores it locally. |
| `GEMINI_API_KEY` | Key for the Gemini provider (`GOOGLE_API_KEY` is also accepted). |
| `EXAMOS_MODEL_ANTHROPIC` | Model for the Anthropic provider. Defaults to `claude-opus-5`. |
| `EXAMOS_MODEL_GEMINI` | Model for the Gemini provider. Defaults to `gemini-3.8-flash`. |
| `EXAMOS_MODEL` | Applies to whichever provider its value names, for a single-provider setup. |
| `EXAMOS_SESSION_SECRET` | Signs session cookies. Generated and stored locally if unset. |
| `EXAMOS_DATA_DIR` | Where the database and uploads live. Defaults to `./data`. |
| `EXAMOS_SQL_WASM` | Path to `sql-wasm.wasm`. Normally resolved automatically. |

---

## How it is built

**Next.js 16** (App Router, server actions) · **React 19** · **TypeScript** ·
**Tailwind CSS v4**.

**SQLite through `sql.js`**, a WebAssembly build of SQLite. One code path
across `next dev`, a self-hosted server and the packaged desktop app, with no
native modules to rebuild per platform. The whole database is held in memory
and flushed atomically after each write — the right trade for a single-student
workload.

**Nineteen tables.** Users, exams, exam parts, materials, topics, topic items,
previous exams, research sources, attempts, questions, answers, scan pages,
mistakes, topic mastery, performance snapshots, study plans, study tasks, study
materials and notifications. Every row a person owns carries `user_id`, so
access control is a `WHERE` clause rather than something to remember. The
schema is applied on every start, and additive column migrations run after it,
so an existing database upgrades in place instead of being rebuilt.

**Authentication** is local: scrypt password hashing and a signed JWT in an
httpOnly cookie. No external identity provider, no cloud sync.

**Charts** are hand-written SVG — no charting dependency. Colours were checked
with a contrast and colour-vision validator against this app's own surfaces;
every chart also renders an accessible table of the same numbers, which is what
prints.

**Printing** uses a print stylesheet and dedicated `/print/*` routes rather than
a server-side PDF engine, so the output is real text at real resolution. In the
desktop app, **File → Save as PDF** writes the file directly.

### AI architecture

**Two providers, one contract.** ExamOS runs on **Anthropic (Claude)** or
**Google (Gemini)** — chosen in Settings, or fixed with `EXAMOS_PROVIDER`.
Everything above the provider is identical: the same prompts, the same honesty
rules, the same validated schemas, and the same deterministic readiness engine,
which no provider ever touches. A provider implements exactly two things
(`src/lib/ai/provider.ts`): structured output, and a web search that returns
its hits rather than prose about them.

Gemini reads a documented subset of JSON Schema, so the app's zod contracts are
converted and pruned to that subset (`src/lib/ai/json-schema.ts`, tested).
Dropping a constraint from the *request* never loosens what the app accepts:
the reply is still parsed with the full zod schema before anything is stored.

**On Gemini's free tier:** Google states that free-tier content is used to
improve their products, which can include human review. Uploaded course
material is your university's, so use a paid key — or Anthropic — for anything
treated as confidential. The app says this next to the key field rather than
only here.

Every model call returns validated JSON — no free-form prose is parsed
anywhere.

| Workflow | What it does |
|---|---|
| Course analysis | Topics and their contents, with per-file references. Reads images through vision. |
| Previous-exam analysis | Observable patterns in the papers you provided, phrased as observations. |
| Previous-exam research | A real web search; results stored with their URLs for you to check. Google's grounding returns its own redirect links, which are stored exactly as given rather than rewritten. |
| Question generation | Questions from your material, then a two-stage quality gate. |
| Answer evaluation | Marks written answers against the criteria stored with each question. |
| Scan reading | Transcribes handwriting and reports its own confidence. |
| Study sheets | Concise revision material from your content and your mistakes. |
| Study plan | Turns a fixed, code-computed priority order into scheduled work. |

**Cost control.** Material is chunked once and ranked with a BM25-style scorer,
so only the passages relevant to what is being generated are sent — a 200-page
course pack costs a few thousand tokens per batch, not the whole document.
Analysis results are cached in the database, and the system prompt is cached
across the calls of a workflow.

**The quality gate** runs mechanical checks first (duplicates, missing answers,
option indexes that point nowhere, dishonest source labels), then a model review
pass. Anything that fails is regenerated before you see the test.

---

## Testing

```bash
npm run typecheck
npm test                 # 41 unit tests: scoring engine, quality gate, schema conversion
npm run seed:demo        # a worked example to click through
npm run test:e2e         # 56 browser tests: 28 checks at desktop and phone width
```

The unit tests cover the parts that must be provably right: the grading-scale
conversion, working backwards from a target through exam weight, recency
weighting, consistency, the band ceiling, and every source-label rule.

The browser tests walk every screen at desktop and phone width, in both
languages, and check that AI features refuse cleanly when no key is configured
and that one account cannot reach another's data. Seven of them cover exams in
parts: that the countdown names the next sitting, that readiness and generated
tests stay inside that sitting's topics, and that a banked result changes what
the remaining sitting has to score.

`npm run seed:demo` fills a database with a realistic worked example — a
Data Structures exam split into two kolokviums, the first already sat and
graded, the second 17 days out, with three improving practice tests, a mastery
profile, a mistake book and a study plan — so the whole product can be
exercised without spending model calls.

---

## Not built

Deliberately out of scope: social features, messaging, leaderboards,
gamification, a marketplace, a general calendar, and a general-purpose chat
page. The product is the loop above.
