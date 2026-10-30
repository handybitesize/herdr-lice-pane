# LiCE Pane Header (Herdr mod)

A [Herdr](https://herdr.dev) pane header for panes working inside a
[LiCE](https://lice.tools) project (a folder with `.nitconfig.json`). It adds
a strip to each pane header showing the selected **Nit id** (click it to open
the Nit in the browser), its **workflow stage**, the **git branch** (flagged
in red with ⚠ when the checkout isn't on the Nit's branch), and a
**branch-status glyph** (✓ clean · ● dirty · ↑/↓/↕ ahead/behind/diverged).

![LiCE Pane Header](preview.png)

Outside a LiCE project the header behaves exactly like Herdr's shipped `pane`
header and shows no strip.

## Install

1. Copy `mods/lice-pane/` into `~/.config/herdr-app/mods/`.
2. Check it: `herdr-app check ~/.config/herdr-app/mods/lice-pane`.
3. Use it in a layout's pane frame. The shipped layouts are read-only, so
   clone one and point its pane header at the mod:
   ```sh
   herdr-app do layout.clone '{"name":"main","as":"lice"}'
   ```
   then in `~/.config/herdr-app/layouts/lice.json` set the tab block's
   `pane.header.content.mod` to `"lice-pane"`.
4. `ctrl-shift-l` cycles layouts; the `lice` layout is yours and survives
   restarts.

## What it reads (and runs)

Per LiCE-enabled pane, on a gentle 4s timer, in the pane's folder on the
pane's machine:

- `readTextFile(".nit.local.json")` → the selected Nit id.
- `nit status --verbose` → the stage and the Nit's recorded branch.
- `git branch --show-current` and `git status --porcelain=v2 --branch` → the
  current branch and clean/dirty/ahead/behind.

Clicking the Nit chip runs `nit web <id>`. It runs the `nit` and `git` CLIs
via Herdr's `exec`; it makes no network calls of its own (`nit` talks to the
LiCE server itself). It reads `.nitconfig.json`/`.nit.local.json` and runs
`git`/`nit` only inside the pane's own repo folder.

## Build it from scratch

See [`RECIPE.md`](RECIPE.md) — the full brief another agent can build this
from with an empty folder.

## Requirements

- Herdr (herdr-app + herdr-core).
- The `nit` CLI on PATH, in a LiCE-attached repo (`.nitconfig.json`).
- Uses the shipped `workspace-chrome` mod's spinner asset (present on every
  Herdr install).
