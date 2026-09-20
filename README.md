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
| **Upload material** | PDF, Word, PowerPoint, plain text, and photos of handwritten notes. |
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

**"Not found" is not "does not exist".** When no past papers are available it
says so, and says explicitly that this does not mean none exist.

**An unreadable answer is never marked wrong.** A scanned answer the model
could not read is excluded from the score and flagged for you to type in.

**Grade conversion is labelled as the app's own default.** The
percentage-to-grade mapping is shown as an ExamOS default, not a university
rule, and you can edit it per exam.

**No key, no invention.** Without an API key the AI features refuse with a
clear message rather than producing placeholder content.

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
the Actions tab; either way the `.exe` is in the run's **Artifacts** section.
Pushing a `v*` tag additionally publishes a GitHub Release with the installers
for all three platforms attached.

The Windows installer is a standard wizard: choose the folder, then Install.
It is unsigned, so Windows SmartScreen warns on first launch — choose
**More info → Run anyway**.

The desktop app is the same application as the web build, wrapped in Electron.
It starts its own local server and keeps its database in the OS application-data
folder (`%APPDATA%\ExamOS` on Windows), so your data survives reinstalls.
**File → Open data folder** shows you exactly where it is.

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
| `ANTHROPIC_API_KEY` | Required for every AI feature. Can also be set in Settings, which stores it locally. |
| `EXAMOS_MODEL` | Model for the structured workflows. Defaults to `claude-opus-5`. |
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

**Eighteen tables.** Users, exams, materials, topics, topic items, previous
exams, research sources, attempts, questions, answers, scan pages, mistakes,
topic mastery, performance snapshots, study plans, study tasks, study materials
and notifications. Every row a person owns carries `user_id`, so access control
is a `WHERE` clause rather than something to remember.

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

Every model call returns validated JSON — no free-form prose is parsed
anywhere.

| Workflow | What it does |
|---|---|
| Course analysis | Topics and their contents, with per-file references. Reads images through vision. |
| Previous-exam analysis | Observable patterns in the papers you provided, phrased as observations. |
| Previous-exam research | A real web search; results stored with their URLs for you to check. |
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
npm test                 # 34 unit tests: scoring engine and quality gate
npm run seed:demo        # a worked example to click through
npm run test:e2e         # 34 browser tests, desktop and mobile viewports
```

The unit tests cover the parts that must be provably right: the grading-scale
conversion, working backwards from a target through exam weight, recency
weighting, consistency, the band ceiling, and every source-label rule.

The browser tests walk every screen at desktop and phone width, in both
languages, and check that AI features refuse cleanly when no key is configured
and that one account cannot reach another's data.

`npm run seed:demo` fills a database with a realistic worked example — a
Data Structures exam 17 days out, three improving practice tests, a mastery
profile, a mistake book and a study plan — so the whole product can be
exercised without spending model calls.

---

## Not built

Deliberately out of scope: social features, messaging, leaderboards,
gamification, a marketplace, a general calendar, and a general-purpose chat
page. The product is the loop above.
