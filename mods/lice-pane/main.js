// A pane header for panes inside a LiCE project (a folder with .nitconfig.json).
// On top of the shipped pane header (icon, name, folder, agent status, hover
// buttons) it adds a LiCE strip: the selected Nit's id + stage, the git branch
// (warned in red when the checkout isn't on the Nit's branch), and a branch
// status glyph (clean / dirty / ahead / behind / diverged).
//
// Used by a layout pane frame:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "lice-pane" } } } }
// Props from the app: { pane, terminal }. Click the bar: focus the pane.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, exec, readTextFile } from "herdr";

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// Pull a "  Key:   value" line out of `nit status --verbose` text.
function statusField(text, key) {
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z]+):\s+(.*\S)\s*$/);
    if (m && m[1].toLowerCase() === key.toLowerCase()) return m[2].trim();
  }
  return null;
}

// Parse `git status --porcelain=v2 --branch` into { dirty, ahead, behind }.
function parseGitStatus(text) {
  let dirty = false;
  let ahead = 0;
  let behind = 0;
  for (const line of text.split("\n")) {
    if (!line) continue;
    if (line.startsWith("#")) {
      const m = line.match(/^# branch\.ab \+(\d+) -(\d+)/);
      if (m) {
        ahead = Number(m[1]) || 0;
        behind = Number(m[2]) || 0;
      }
      continue;
    }
    // Any non-# line (1/2 tracked change, u unmerged, ? untracked) ⇒ dirty.
    dirty = true;
  }
  return { dirty, ahead, behind };
}

async function readJson(path, on) {
  try {
    const text = await readTextFile(path, { on });
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function ok(cmd, args, cwd, on) {
  try {
    const r = await exec(cmd, args, { cwd, on });
    return r.code === 0 ? (r.stdout ?? "").trim() : null;
  } catch {
    return null;
  }
}

export default class LicePane extends View {
  init(_props, cx) {
    this.hovered = false;
    this.lice = undefined; // undefined: not read yet; null: not a LiCE pane; object: data
    this.probedKey = null; // cwd|branch we last ran a probe for
    cx.timer.every(4000, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  // Walk cwd and its ancestors (up to ~) looking for .nitconfig.json; return the root, else null.
  async liceRoot(cwd, on) {
    const h = home();
    let dir = cwd;
    for (let i = 0; i < 40 && dir; i++) {
      if (await readTextFile(`${dir}/.nitconfig.json`, { on })) return dir;
      if (dir === h || dir === "/" || !dir.includes("/")) break;
      const parent = dir.slice(0, dir.lastIndexOf("/")) || "/";
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  refresh(cx) {
    const p = this.me();
    const cwd = p?.cwd ?? null;
    const on = p?.machine ?? null;
    // Mod panes / no folder: nothing to probe.
    if (!cwd) {
      if (this.lice !== null) {
        this.lice = null;
        cx.notify();
      }
      return;
    }
    const key = `${on ?? ""}::${cwd}::${p?.branch ?? ""}`;
    this.probedKey = key;
    cx.spawn(async (cx) => {
      const root = await this.liceRoot(cwd, on);
      // A pane can change out from under us while we await; bail if so.
      if (this.probedKey !== key) return;
      if (!root) {
        this.lice = null;
        return cx.notify();
      }
      const local = await readJson(`${root}/.nit.local.json`, on);
      const nitId = local?.selectedNit ?? null;

      const statusText = await ok("nit", ["status", "--verbose"], cwd, on);
      const stage = statusText ? statusField(statusText, "Stage") : null;
      const nitBranch = statusText ? statusField(statusText, "Branch") : null;

      const current = await ok("git", ["branch", "--show-current"], cwd, on);
      const gitText = await ok("git", ["status", "--porcelain=v2", "--branch"], cwd, on);
      const git = gitText != null ? parseGitStatus(gitText) : null;

      if (this.probedKey !== key) return;
      this.lice = { nitId, stage, nitBranch, current, git };
      cx.notify();
    });
  }

  button(t, id, iconName, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/lice-pane/${iconName}.svg`).size(14));
  }

  // The LiCE strip children, appended to the header row. [] when not a LiCE pane.
  strip(t, p) {
    const l = this.lice;
    if (l === null) return [];
    const out = [];

    if (l === undefined) {
      // First probe still running.
      out.push(div().flex_none().text_size(11).text_color(t.dim).child("\u2026"));
      return out;
    }

    // Nit chip. Click opens the nit in the browser (`nit web <id>`), run in the
    // pane's folder on its machine so the right project/auth is used.
    if (l.nitId) {
      const nitId = l.nitId;
      const cwd = p?.cwd ?? null;
      const on = p?.machine ?? null;
      out.push(
        div()
          .id(`lice-chip-${p?.pane}`)
          .flex_none()
          .px(6)
          .h(18)
          .flex()
          .items_center()
          .rounded(5)
          .bg(t.accent)
          .text_size(11)
          .font_semibold()
          .text_color(t.accent_foreground)
          .cursor_pointer()
          .hover((s) => s.bg(t.solid))
          .on_click((_e, cx) => {
            cx.stop_propagation();
            cx.spawn(async () => {
              try {
                await exec("nit", ["web", nitId], { cwd, on });
              } catch {}
            });
          })
          .child(nitId),
      );
    } else {
      out.push(
        div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.raised).text_size(11).text_color(t.dim).child("\u2014"),
      );
    }

    // Stage.
    if (l.stage) {
      out.push(div().flex_none().text_size(10.5).text_color(t.dim).child(l.stage));
    }

    // Branch (warn when it doesn't match the Nit's recorded branch).
    const current = l.current || null;
    if (current) {
      const mismatch = Boolean(l.nitBranch) && current !== l.nitBranch;
      out.push(
        div()
          .flex_none()
          .truncate()
          .max_w(200)
          .text_size(11.5)
          .text_color(mismatch ? t.blocked : t.dim)
          .child(mismatch ? `\u26a0 ${current}` : current),
      );
    }

    // Branch status glyph.
    if (l.git) {
      const { dirty, ahead, behind } = l.git;
      if (dirty) {
        out.push(div().flex_none().text_size(12).text_color(t.working).child("\u25cf"));
      } else if (ahead === 0 && behind === 0) {
        out.push(div().flex_none().text_size(12).text_color(t.done).child("\u2713"));
      }
      if (ahead > 0 && behind > 0) {
        out.push(div().flex_none().text_size(11).text_color(t.blocked).child(`\u2195 ${ahead}/${behind}`));
      } else if (ahead > 0) {
        out.push(div().flex_none().text_size(11).text_color(t.accent).child(`\u2191${ahead}`));
      } else if (behind > 0) {
        out.push(div().flex_none().text_size(11).text_color(t.idle || t.dim).child(`\u2193${behind}`));
      }
    }

    return out;
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();

    // Re-probe when the pane's folder/branch changed since the last probe.
    // Set probedKey synchronously here so repeated renders in the same frame
    // don't each spawn a probe before refresh() claims the key.
    const key = `${p.machine ?? ""}::${p.cwd ?? ""}::${p.branch ?? ""}`;
    if (key !== this.probedKey) {
      this.probedKey = key;
      cx.spawn(async (c) => this.refresh(c));
    }

    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, t.dim);
    const st = p.status;
    const pane = p.pane;

    return h_flex()
      .id(`lice-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
      .children(this.strip(t, p))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(st === "working", (el) =>
        el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)),
      )
      .when(st === "blocked", (el) =>
        el.child(
          div()
            .flex_none()
            .px(6)
            .h(18)
            .flex()
            .items_center()
            .rounded(5)
            .bg(t.blocked + "26")
            .text_size(10.5)
            .font_semibold()
            .text_color(t.blocked)
            .child("Needs you"),
        ),
      )
      .when(st === "done", (el) => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, (el) =>
        el
          .child(this.button(t, `lh-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
          .child(this.button(t, `lh-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
          .child(this.button(t, `lh-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
          .child(this.button(t, `lh-x-${pane}`, "close", "pane.close", { pane })),
      );
  }
}
