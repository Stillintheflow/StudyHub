# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A collection of standalone single-file HTML learning tools, primarily in Vietnamese context. No build system, no package manager, no framework. Each `.html` file is fully self-contained (HTML + `<style>` + `<script>` in one file) and runs by opening directly in a browser.

## How to run / test

Open any `.html` file directly in a browser — no server needed. For `vocabmaster.html` and `englishmaster.html`, use a browser with localStorage support (all modern browsers) since progress is persisted there.

## File overview

| File | Purpose |
|------|---------|
| `vocabmaster.html` | Vietnamese vocabulary SRS flashcard app (SM-2 algorithm, localStorage). Thin shell that loads `vocabmaster/style.css`, `vocabmaster/data.js`, `vocabmaster/app.js` |
| `englishmaster.html` | IELTS vocabulary SRS flashcard app, 4070 words across 33 topics (SM-2 algorithm, localStorage). Thin shell that loads `englishmaster/style.css`, `englishmaster/data.js`, `englishmaster/app.js` |
| `docker-guide.html` | Docker reference guide with sidebar navigation |
| `angular-reading-guide.html` | Guide for reading Angular codebases, uses highlight.js via CDN |
| `english-review.html` | Hub/landing page for English review material, organized by Unit. Card grid links out to child pages in `english-review/`; add a new card + child page here for each future Unit |
| `english-review/unit-1-grammar.html` | Unit 1 — Grammar: present time (present simple/continuous/perfect simple/perfect continuous, stative verbs). Single-file guide page, same sidebar-nav pattern as `docker-guide.html` |
| `english-review/unit-2-vocabulary.html` | Unit 2 — Travel and transport vocabulary: topic vocabulary in contrast, phrasal verbs, collocations, word patterns, word formation. Same pattern as unit-1-grammar.html |
| `than-so-hoc-le-van-quang.html` | Numerology (Thần Số Học) personal page |

## Architecture pattern

Every file follows the same structure:
1. `:root` CSS custom properties for the color palette (dark themes dominate)
2. All CSS inside a single `<style>` block in `<head>`
3. All JS inside a single `<script>` block at end of `<body>`
4. No external dependencies except CDN links (highlight.js in `angular-reading-guide.html`)

**Exception**: `vocabmaster.html` and `englishmaster.html` are split out of this pattern (see below) because their word-list data is large enough (~71KB and ~525KB respectively) to dominate the file. These are the two multi-file tools in the repo; every other file stays single-file.

## VocabMaster internals

`vocabmaster.html` is a thin shell (head + body markup only) that loads three files from the `vocabmaster/` folder via plain (non-module) `<link>`/`<script src>` tags — kept non-module so the page still works opened directly via `file://`, and all functions/state stay global since the body's inline `onclick="..."` handlers reference them directly:
- `vocabmaster/style.css` — all CSS
- `vocabmaster/data.js` — the hardcoded word list, `const VOCAB = [...]`, each entry is `{term, def, pron}` (English term, Vietnamese definition, IPA pronunciation)
- `vocabmaster/app.js` — all logic:
  - **SRS engine**: SM-2 algorithm in `sm2()` — updates `ease`, `interval`, `reps`, and `nextDue` per card
  - **Storage**: `loadSRS()` / `saveSRS()` and `loadStats()` / `saveStats()` wrap `localStorage` under keys `srs_data` and `vocab_stats`
  - **Modes**: flashcard, quiz, match, spell — dispatched via `startMode()`
  - Entry point: `init()` called on page load; `handleKey()` handles keyboard shortcuts

## IELTS Master internals

`englishmaster.html` follows the same thin-shell split as VocabMaster, loading three files from `englishmaster/`:
- `englishmaster/style.css` — all CSS (own accent color so it reads as a distinct tool in the Study Hub)
- `englishmaster/data.js` — `const IELTS_DATA = {...}`, the source `ielts_5000_vocabulary.json` wrapped as a JS literal (grouped by topic: `{topic_number, topic_en, topic_vi, words: [{word, ipa, meaning}]}`) so it loads via `<script src>` over `file://` without a `fetch()`. The original `englishmaster/ielts_5000_vocabulary.json` is kept alongside as the source of truth if the dataset ever needs regenerating.
- `englishmaster/app.js` — all logic:
  - **Flattening**: `WORDS` flattens all topics into one array (`id` = `"<topic_number>-<index within topic>"`); `TOPICS` is the per-topic summary used by the topic browser
  - **SRS engine**: SM-2 algorithm in `sm2()`, same shape as VocabMaster's but graded on a 4-point scale (again/hard/good/easy = 1/3/4/5) instead of 3
  - **New-word pacing**: unlike VocabMaster (which reviews the whole list every session), this app caps how many never-seen words enter a session per day (`newPerDay` in settings, tracked via `stats.newToday`) — the session mixes due reviews (`getDuePool`) with a slice of not-yet-seen words (`getNewPool`), similar to Anki's daily new-card limit
  - **Storage**: `loadSRS()`/`saveSRS()`, `loadStats()`/`saveStats()`, `loadSettings()`/`saveSettings()` wrap `localStorage` under keys `ielts_srs`, `ielts_stats`, `ielts_settings` — namespaced separately from VocabMaster's `srs_data`/`vocab_stats` so the two tools' progress never collides
  - **Screens**: home (dashboard + settings) → topics (browse/search the 33 topics, click one to study just that topic) → flash (the SRS session) → results
  - Entry point: `init()` called on page load; `handleKey()` handles keyboard shortcuts

## Conventions

- CSS variables always defined in `:root`; never use magic color literals
- Vanilla JS only — no jQuery, no framework
- Vietnamese strings appear throughout UI; keep them when editing existing copy
