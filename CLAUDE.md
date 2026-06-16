# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A collection of standalone single-file HTML learning tools, primarily in Vietnamese context. No build system, no package manager, no framework. Each `.html` file is fully self-contained (HTML + `<style>` + `<script>` in one file) and runs by opening directly in a browser.

## How to run / test

Open any `.html` file directly in a browser — no server needed. For `vocabmaster.html`, use a browser with localStorage support (all modern browsers) since progress is persisted there.

## File overview

| File | Purpose |
|------|---------|
| `vocabmaster.html` | Vietnamese vocabulary SRS flashcard app (SM-2 algorithm, localStorage) |
| `docker-guide.html` | Docker reference guide with sidebar navigation |
| `angular-reading-guide.html` | Guide for reading Angular codebases, uses highlight.js via CDN |
| `than-so-hoc-le-van-quang.html` | Numerology (Thần Số Học) personal page |

## Architecture pattern

Every file follows the same structure:
1. `:root` CSS custom properties for the color palette (dark themes dominate)
2. All CSS inside a single `<style>` block in `<head>`
3. All JS inside a single `<script>` block at end of `<body>`
4. No external dependencies except CDN links (highlight.js in `angular-reading-guide.html`)

## VocabMaster internals

`vocabmaster.html` (~1 500 lines) is the most complex file:
- **SRS engine**: SM-2 algorithm in `sm2()` — updates `ease`, `interval`, `reps`, and `nextDue` per card
- **Storage**: `loadSRS()` / `saveSRS()` and `loadStats()` / `saveStats()` wrap `localStorage` under keys `srs_data` and `vocab_stats`
- **Modes**: flashcard (`currentMode`), matching game (`matchWords`, `matchSelected`)
- **Word list**: hardcoded array near top of `<script>`, each entry is `{ en, vi, example }`
- Entry point: `init()` called on page load; `handleKey()` handles keyboard shortcuts

## Conventions

- CSS variables always defined in `:root`; never use magic color literals
- Vanilla JS only — no jQuery, no framework
- Vietnamese strings appear throughout UI; keep them when editing existing copy
