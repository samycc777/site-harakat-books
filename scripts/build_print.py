#!/usr/bin/env python3
"""Build commercial white-paper print editions (press-ready PDFs + web preview PNGs)
from ~/dev/media-harakat-books/books/<slug>/ using Typst.

Profiles:
  - kdp   : Amazon KDP 6x9 in (152.4 x 228.6 mm), pure B&W interior (no color surcharge), mirrored gutters
  - cairo : Classic Cairo 17x24 cm (170 x 240 mm), 2-color crimson/green accents (or --bw)
  - study : Student Wide-Margin Edition 17x24 cm with 50mm outer note-taking column + bottom notes space

Usage:
  python3 scripts/build_print.py <slug> [--profiles kdp,cairo,study] [--previews] [--bw]
"""
import argparse, json, os, re, shutil, subprocess, sys
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parent.parent
MEDIA_ROOT = Path.home() / "dev" / "media-harakat-books"
BOOKS_DIR = MEDIA_ROOT / "books"
OUT_ROOT = SITE_ROOT / "print-editions"
PREVIEW_ROOT = SITE_ROOT / "public" / "print" / "previews"
FONT_PATHS = [
    str(Path.home() / "Library" / "Fonts"),
    "/Library/Fonts",
    "/System/Library/Fonts",
]

AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
def ar_num(n): return str(n).translate(AR_DIGITS)

sys.path.insert(0, str(MEDIA_ROOT / "scripts"))
try:
    from grades import load_grades, note_key
except Exception:
    def load_grades(_): return {}
    def note_key(s): return s

PROFILES = {
    "kdp": {
        "name_ar": "طَبْعَةُ الْقِرَاءَةِ الدَّوْلِيَّةُ (٦ × ٩ بُوصَة)",
        "name_en": "Global Paperback (6×9 in — Amazon KDP)",
        "width": "152.4mm",
        "height": "228.6mm",
        "inside": "20mm",
        "outside": "15mm",
        "top": "18mm",
        "bottom": "19mm",
        "body_size": "13pt",
        "leading": "1.52em",
        "bw": True,
        "wide_margin": False,
    },
    "cairo": {
        "name_ar": "الطَّبْعَةُ الْكِلَاسِيكِيَّةُ (١٧ × ٢٤ سم)",
        "name_en": "Cairo Classic Trim (17×24 cm)",
        "width": "170mm",
        "height": "240mm",
        "inside": "22mm",
        "outside": "18mm",
        "top": "20mm",
        "bottom": "21mm",
        "body_size": "13.5pt",
        "leading": "1.55em",
        "bw": False,
        "wide_margin": False,
    },
    "study": {
        "name_ar": "طَبْعَةُ طَالِبِ الْعِلْمِ — هَامِشٌ وَاسِعٌ لِلتَّعْلِيقِ (١٧ × ٢٤ سم)",
        "name_en": "Student Wide-Margin Study Edition (17×24 cm)",
        "width": "170mm",
        "height": "240mm",
        "inside": "19mm",
        "outside": "52mm",
        "top": "19mm",
        "bottom": "30mm",
        "body_size": "12pt",
        "leading": "1.55em",
        "bw": False,
        "wide_margin": True,
    },
}

# Escape characters that have special meaning in Typst markup mode.
_TYPST_SPECIAL = re.compile(r'([\\#$@*_<>`\[\]()/~=\-+])')

def t_esc(s: str) -> str:
    return _TYPST_SPECIAL.sub(r'\\\1', s)

def t_str(s: str) -> str:
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

def parse_book(slug: str):
    book = BOOKS_DIR / slug
    if not book.exists():
        raise SystemExit(f"Book folder not found: {book}")
    meta_lines = (book / "meta.txt").read_text("utf-8").splitlines()
    title = meta_lines[0].strip()
    sub = meta_lines[1].strip() if len(meta_lines) > 1 else ""
    tab = meta_lines[2].strip() if len(meta_lines) > 2 else title
    grades = load_grades(book)

    def marks(text, page_grades):
        clean = re.sub(r"﴿.+?﴾", "", text)
        return {page_grades[n] for n in re.findall(r"\(([٠-٩]+)\)", clean) if n in page_grades}

    pages_parsed = []
    # We keep per-page structure first so footnotes pair accurately with the same page's paragraphs,
    # matching media-harakat-books/scripts/build.py semantics.
    blocks = []  # [kind, text, mark, page_idx]
    page_notes = []  # list of dicts {marker: text} per page, plus leftover list

    pg_files = sorted((book / "pages").glob("pg-*.txt"))
    for pidx, f in enumerate(pg_files):
        body, _, notes = ("\n" + f.read_text("utf-8")).partition("\n---\n")
        lines = [l.strip() for l in body.splitlines() if l.strip() and l.strip() != "@blank"]
        if lines and lines[0].startswith("@cont "):
            lines[0:1] = ["@cont", lines[0][6:].strip()]
        cont = bool(lines) and lines[0] == "@cont"
        paras = [l for l in lines[1 if cont else 0:] if l]

        page_grades = {}
        for n in notes.splitlines():
            m = re.match(r"\(([٠-٩]+)\)\s*(.*)", n.strip())
            if m and note_key(m.group(2)) in grades:
                page_grades[m.group(1)] = grades[note_key(m.group(2))]

        for i, l in enumerate(paras):
            if i == 0 and cont:
                last = max((j for j, b in enumerate(blocks) if b[0] == "p"), default=None)
                if last is not None:
                    blocks[last][1] += " " + l
                    blocks[last][2] |= marks(l, page_grades)
                    blocks[last][3].add(pidx)
                    continue
            kind = "h2" if l.startswith("## ") else "p"
            txt = l[3:].strip() if kind == "h2" else l
            blocks.append([kind, txt, marks(l, page_grades) if kind == "p" else set(), {pidx}])

        fns = [n.strip() for n in notes.splitlines() if n.strip()]
        if fns and fns[0].startswith("="):
            fnb = [b for b in blocks if b[0] == "fn"][-2:]
            prev = next((b for b in reversed(fnb) if any(l.rstrip().endswith("=") for l in b[1])), fnb[-1] if fnb else None)
            if prev:
                cut = [i for i, l in enumerate(prev[1]) if l.rstrip().endswith("=")] or [len(prev[1]) - 1]
                conts = [i for i, l in enumerate(fns) if l.startswith("=")][:len(cut)]
                for ci, k in zip(conts, cut):
                    prev[1][k] = prev[1][k].rstrip("= ") + " " + fns[ci].lstrip("= ")
                fns = [l for i, l in enumerate(fns) if i not in conts[:len(cut)]]
        if fns:
            blocks.append(["fn", fns, set(), {pidx}])

    # Identify signature, poetry, trees, tables (same as build.py)
    sig = next((j for j, b in enumerate(blocks) if b[:2] == ["p", "وَكَتَبَ"]), len(blocks))
    for b in blocks[sig:]:
        if b[0] == "p":
            b[0] = "sig"
    for b in blocks:
        if b[0] == "p" and b[1].startswith("~ "):
            b[0] = "bayt"
        elif b[0] == "p" and re.match(r"^>+\s+", b[1]):
            b[0] = "tree"
        elif b[0] == "p" and " | " in b[1]:
            b[0] = "tr"

    return title, sub, tab, blocks


def pair_footnotes(blocks):
    """Attach each page's .fn notes to inline markers in preceding paragraphs of that page slice.
    Returns (blocks_with_attached_notes) where each block may carry a dict of {marker: note_text}."""
    lead_re = re.compile(r"^\s*\(([٠-٩0-9]+|[٭*]+)\)\s*")
    num_re = re.compile(r"\(([٠-٩0-9]+|[٭*]+)\)")
    attached = [{} for _ in blocks]
    dropped_fn = set()

    # Walk each fn block and inspect the slice of non-fn blocks right before it
    for idx, b in enumerate(blocks):
        if b[0] != "fn":
            continue
        notes = {}
        order = []
        last_key = None
        for line in b[1]:
            m = lead_re.match(line)
            if m and m.group(1) not in notes:
                k = m.group(1)
                notes[k] = {"text": line[m.end():].strip(), "used": False}
                order.append(k)
                last_key = k
            elif last_key is not None:
                notes[last_key]["text"] += " " + line.strip()

        # Preceding non-fn slice
        j = idx - 1
        while j >= 0 and blocks[j][0] == "fn":
            j -= 1
        slice_idxs = []
        while j >= 0 and blocks[j][0] != "fn":
            slice_idxs.append(j)
            j -= 1
        slice_idxs.reverse()

        for bi in slice_idxs:
            if blocks[bi][0] not in ("p", "h2", "bayt"):
                continue
            txt = blocks[bi][1]
            for m in num_re.finditer(txt):
                k = m.group(1)
                if k not in notes or notes[k]["used"]:
                    continue
                pre = txt[:m.start()]
                if pre.count("﴿") > pre.count("﴾"):
                    continue
                notes[k]["used"] = True
                attached[bi][k] = notes[k]["text"]

        remaining = [f"({k}) {notes[k]['text']}" for k in order if not notes[k]["used"]]
        if not remaining:
            dropped_fn.add(idx)
        else:
            b[1] = remaining

    return attached, dropped_fn


def weak_label(mark):
    for kind, word in (("", "حَدِيثٌ"), ("athar-", "أَثَرٌ")):
        m = {g[len(kind):] for g in mark if g.startswith(kind) and (kind or not g.startswith("athar-"))}
        if "mixed" in m:
            m |= {"weak", "authentic"}
        bad = m & {"weak", "fabricated"}
        if not bad:
            continue
        if m & {"authentic"} or any(g.endswith("authentic") or g.endswith("mixed") for g in mark):
            return f"فِيهِ {word} ضَعِيفٌ"
        return f"{word} " + ("مَوْضُوعٌ" if bad == {"fabricated"} else "ضَعِيفٌ")
    return ""


def render_inline(s: str, fn_map: dict = None) -> str:
    """Convert bold **...**, underline <u>...</u>, Quran ﴿...﴾, and paired footnote markers (١) to Typst markup."""
    fn_map = dict(fn_map or {})
    def render_u(txt: str) -> str:
        uparts = re.split(r"(<u>.+?</u>)", txt)
        res = []
        for up in uparts:
            if not up:
                continue
            if up.startswith("<u>") and up.endswith("</u>"):
                res.append(f"#underline(offset: 0.25em)[{t_esc(up[3:-4])}];")
            else:
                res.append(t_esc(up))
        return "".join(res)
    # Split out Quran spans first so we never parse footnotes or bold inside verses
    parts = re.split(r"(﴿.+?﴾)", s)
    out = []
    for part in parts:
        if not part:
            continue
        if part.startswith("﴿") and part.endswith("﴾"):
            out.append(f"#quran[{render_u(part)}];")
            continue
        # Handle **bold**
        bparts = re.split(r"(\*\*.+?\*\*)", part)
        for bp in bparts:
            if not bp:
                continue
            is_bold = bp.startswith("**") and bp.endswith("**") and len(bp) > 4
            inner = bp[2:-2] if is_bold else bp
            if fn_map:
                # Replace paired (marker) with Typst footnote
                segs = []
                last = 0
                for m in re.finditer(r"\(([٠-٩0-9]+|[٭*]+)\)", inner):
                    k = m.group(1)
                    if k in fn_map:
                        segs.append(render_u(inner[last:m.start()]))
                        note_body = render_inline(fn_map.pop(k), None)
                        segs.append(f"#footnote[{note_body}];")
                        last = m.end()
                segs.append(render_u(inner[last:]))
                rendered = "".join(segs)
            else:
                rendered = render_u(inner)
            out.append(f"#strong[{rendered}];" if is_bold else rendered)
    return "".join(out)


def render_table(rows):
    grid = []
    max_cols = 0
    for r, text in enumerate(rows):
        bold = text.startswith("**") and text.endswith("**")
        cells = [c.strip() for c in (text[2:-2] if bold else text).split(" | ")]
        max_cols = max(max_cols, len(cells))
        row = []
        for c, val in enumerate(cells):
            if val == "<" and c > 0:
                owner = row[c - 1]
                if owner["r"] == r:
                    owner["colspan"] += 1
                row.append(owner)
            elif val == "^" and r > 0 and c < len(grid[r - 1]):
                owner = grid[r - 1][c]
                if owner["c"] == c:
                    owner["rowspan"] += 1
                row.append(owner)
            else:
                row.append({"bold": bold, "text": val, "colspan": 1, "rowspan": 1, "r": r, "c": c})
        grid.append(row)

    cell_strs = []
    for r, row in enumerate(grid):
        for c, cell in enumerate(row):
            if cell["r"] != r or cell["c"] != c:
                continue
            args = []
            if cell["colspan"] > 1:
                args.append(f"colspan: {cell['colspan']}")
            if cell["rowspan"] > 1:
                args.append(f"rowspan: {cell['rowspan']}")
            if cell["bold"]:
                args.append("fill: accent-tint")
            content = render_inline(cell["text"])
            if cell["bold"]:
                content = f"#strong[{content}]"
            if args:
                cell_strs.append(f"table.cell({', '.join(args)})[{content}]")
            else:
                cell_strs.append(f"[{content}]")
    cols_arg = ", ".join(["1fr"] * max(1, max_cols))
    return (
        f"#block(above: 0.9em, below: 0.9em, breakable: true)[\n"
        f"  #set text(size: 0.9em)\n"
        f"  #table(columns: ({cols_arg}), align: center + horizon, stroke: 0.5pt + rule-color, inset: 6pt,\n"
        f"    " + ",\n    ".join(cell_strs) + "\n  )\n]"
    )


def render_tree(items):
    lines = ["#block(above: 0.7em, below: 0.8em, inset: (right: 0.6em), stroke: (right: 1.5pt + rule-color))["]
    for depth, text in items:
        pad = f"{(depth - 1) * 1.2}em"
        bullet = "◆" if depth == 1 else ("▪" if depth == 2 else "•")
        content = render_inline(text)
        if depth == 1:
            content = f"#strong[{content}]"
        lines.append(f"  #pad(right: {pad}, bottom: 0.2em)[{bullet} {content}]")
    lines.append("]")
    return "\n".join(lines)


def build_typst_source(slug, title, sub, tab, author, blocks, profile_key, force_bw=False):
    prof = dict(PROFILES[profile_key])
    if force_bw:
        prof["bw"] = True
    bw = prof["bw"]
    accent = 'rgb("#111111")' if bw else 'rgb("#8b1e24")'
    accent_soft = 'rgb("#555555")' if bw else 'rgb("#d99a98")'
    accent_tint = 'rgb("#f2f2f2")' if bw else 'rgb("#fbf1f0")'
    quran_color = 'rgb("#000000")' if bw else 'rgb("#1b4d2e")'
    rule_color = 'rgb("#888888")' if bw else 'rgb("#c8b6b4")'
    weak_color = 'rgb("#444444")' if bw else 'rgb("#a3222b")'

    # Clean short title for running headers
    short_title = title.split(":")[0].strip()
    if len(short_title) > 48:
        short_title = tab[:48]

    attached, dropped_fn = pair_footnotes(blocks)

    body_parts = []
    i = 0
    while i < len(blocks):
        if i in dropped_fn:
            i += 1
            continue
        kind, text, mark, _ = blocks[i]
        if kind == "tree":
            items = []
            while i < len(blocks) and blocks[i][0] == "tree":
                m = re.match(r"^(>+)\s+(.*)", blocks[i][1])
                items.append((len(m.group(1)), m.group(2)))
                i += 1
            body_parts.append(render_tree(items))
            continue
        if kind == "tr":
            rows = []
            while i < len(blocks) and blocks[i][0] == "tr":
                rows.append(blocks[i][1])
                i += 1
            body_parts.append(render_table(rows))
            continue
        if kind == "h2":
            if text.startswith("بِسْمِ"):
                body_parts.append(f"#align(center)[#block(above: 0.6em, below: 0.8em)[#text(size: 1.15em, weight: \"bold\", fill: quran-color)[{render_inline(text)}]]]")
            else:
                body_parts.append(f"#heading(level: 1)[{render_inline(text, attached[i])}]")
        elif kind == "p":
            wl = weak_label(mark)
            rendered = render_inline(text, attached[i])
            if wl:
                body_parts.append(
                    f"#block(above: 0.6em, below: 0.6em, inset: (right: 0.7em, y: 0.25em), stroke: (right: 2pt + weak-color))["
                    f"#text(size: 0.82em, weight: \"bold\", fill: weak-color)[\\[{t_esc(wl)}\\]] #linebreak() "
                    f"#text(fill: rgb(\"#444444\"))[{rendered}]]"
                )
            else:
                body_parts.append(f"{rendered}\n")
        elif kind == "bayt":
            halves = [h.strip() for h in text[2:].split(" | ", 1)]
            if len(halves) == 2:
                body_parts.append(
                    f"#block(above: 0.45em, below: 0.45em, breakable: false)["
                    f"#grid(columns: (1fr, 1.4em, 1fr), align: (left, center, right), "
                    f"[{render_inline(halves[0], attached[i])}], [ ], [{render_inline(halves[1])}])]"
                )
            else:
                body_parts.append(f"#align(center)[#block(above: 0.4em, below: 0.4em)[{render_inline(halves[0], attached[i])}]]")
        elif kind == "sig":
            body_parts.append(f"#align(left)[#block(above: 0.5em, below: 0.3em)[#strong[{render_inline(text)}]]]")
        elif kind == "fn":
            lines = "\n".join(f"#par(leading: 0.9em)[{render_inline(n)}]" for n in text)
            body_parts.append(
                f"#block(above: 0.7em, below: 0.9em, inset: (top: 0.45em), stroke: (top: 0.5pt + rule-color))["
                f"#set text(size: 0.84em, fill: rgb(\"#444444\"))\n{lines}\n]"
            )
        i += 1

    # Wide-margin study note column background (drawn on body pages only, counter >= 1)
    study_bg = ""
    if prof["wide_margin"]:
        study_bg = """
  background: context {
    if counter(page).get().first() >= 1 and here().page() > 2 {
      let odd = calc.odd(here().page())
      // In RTL book binding, odd (right) pages have outer margin on the LEFT; even (left) pages have outer margin on the RIGHT.
      let line-x = if odd { 46mm } else { page.width - 46mm }
      place(top + left, dx: line-x, dy: 19mm, line(start: (0pt, 0pt), end: (0pt, page.height - 46mm), stroke: 0.45pt + rgb("#d2c4c2")))
      let lbl-x = if odd { 7mm } else { page.width - 43mm }
      place(top + left, dx: lbl-x, dy: 14mm, box(width: 36mm, align(center, text(size: 8.5pt, fill: rgb("#8a7e7c"))[حَوَاشٍ وَتَعْلِيقَاتٌ])))
    }
  },"""

    typ = f"""// Generated by site-harakat-books/scripts/build_print.py — profile: {profile_key}
#let accent = {accent}
#let accent-soft = {accent_soft}
#let accent-tint = {accent_tint}
#let quran-color = {quran_color}
#let rule-color = {rule_color}
#let weak-color = {weak_color}
#let book-short = {t_str(short_title)}

#let ar-digits(n) = {{
  let s = str(n)
  s.replace("0", "٠").replace("1", "١").replace("2", "٢").replace("3", "٣").replace("4", "٤").replace("5", "٥").replace("6", "٦").replace("7", "٧").replace("8", "٨").replace("9", "٩")
}}

#let quran(body) = text(fill: quran-color)[#body]

#set text(
  font: ("Amiri", "Kitab", "Noto Naskh Arabic"),
  size: {prof["body_size"]},
  lang: "ar",
  dir: rtl,
  fill: rgb("#111111"),
)

#set par(
  justify: true,
  leading: {prof["leading"]},
  spacing: 0.95em,
  first-line-indent: 0pt,
)

#set page(
  width: {prof["width"]},
  height: {prof["height"]},
  margin: (
    inside: {prof["inside"]},
    outside: {prof["outside"]},
    top: {prof["top"]},
    bottom: {prof["bottom"]},
  ),
  binding: right,
  header-ascent: 28%,
  footer-descent: 28%,
  header: context {{
    if here().page() <= 2 {{ return }}
    let p = here().page()
    let odd = calc.odd(p)
    let hs = query(selector(heading.where(level: 1)).before(here()))
    let cur = if hs.len() > 0 {{ hs.last().body }} else {{ book-short }}
    set text(size: 9pt, fill: rgb("#555555"))
    block(width: 100%, below: 4pt, inset: (bottom: 3pt), stroke: (bottom: 0.4pt + rule-color))[
      #if odd {{
        align(center)[#book-short]
      }} else {{
        align(center)[#cur]
      }}
    ]
  }},
  footer: context {{
    if here().page() <= 2 {{ return }}
    let n = counter(page).get().first()
    set text(size: 10pt, fill: rgb("#333333"))
    align(center)[— #ar-digits(n) —]
  }},{study_bg}
)

#set footnote(numbering: n => ar-digits(n))
#set footnote.entry(
  separator: align(right)[#line(length: 35%, stroke: 0.5pt + rule-color)],
  gap: 0.45em,
  indent: 0pt,
)
#show footnote.entry: set text(size: 0.78em, fill: rgb("#333333"))
#show footnote.entry: set par(leading: 0.85em, justify: true)

#show heading.where(level: 1): it => {{
  block(
    width: 100%,
    above: 1.55em,
    below: 0.75em,
    sticky: true,
    inset: (bottom: 0.25em),
    stroke: (bottom: 0.6pt + accent-soft),
  )[
    #set text(size: 14.5pt, weight: "bold", fill: accent)
    #set par(justify: false, leading: 1.35em)
    #it.body
  ]
}}

// ===== PAGE 1: CLASSICAL DOUBLE-FRAMED TITLE PAGE =====
#page(margin: 14mm, header: none, footer: none, background: none)[
  #box(
    width: 100%,
    height: 100%,
    stroke: 3.5pt + accent-soft,
    inset: 4pt,
  )[
    #box(
      width: 100%,
      height: 100%,
      stroke: 1.2pt + accent,
      inset: 14mm,
    )[
      #align(center)[
        #v(1.2fr)
        #text(size: 11pt, fill: accent, weight: "bold")[سِلْسِلَةُ كُتُبٍ مَشْكُولَةٍ لِطَالِبِ الْعِلْمِ]
        #v(0.7cm)
        #line(length: 42%, stroke: 0.8pt + accent-soft)
        #v(0.8cm)
        #par(justify: false, leading: 1.5em)[
          #text(size: 21pt, weight: "bold", fill: accent)[{t_esc(title)}]
        ]
        #v(0.6cm)
        {f'#par(justify: false, leading: 1em)[#text(size: 13pt, fill: rgb("#333333"))[{t_esc(sub)}]]' if sub else ''}
        #v(0.8cm)
        #line(length: 42%, stroke: 0.8pt + accent-soft)
        #v(0.7cm)
        #text(size: 11pt, fill: rgb("#444444"))[{t_esc(prof["name_ar"])}]
        #v(1.6fr)
        #text(size: 10.5pt, weight: "bold", fill: accent)[طَبْعَةُ مَوْقِعِ كُتُبٍ مَشْكُولَةٍ]
        #v(0.15cm)
        #text(size: 9.5pt, fill: rgb("#555555"), dir: ltr)[mashkula.com]
      ]
    ]
  ]
]

// ===== PAGE 2: EDITION COLOPHON =====
#page(margin: 20mm, header: none, footer: none, background: none)[
  #v(1fr)
  #block(width: 100%, inset: 12pt, stroke: 0.6pt + rule-color, radius: 4pt)[
    #set text(size: 10.5pt)
    #set par(leading: 1.05em, spacing: 0.6em, justify: false)
    #text(weight: "bold", fill: accent, size: 12pt)[بِطَاقَةُ الطَّبْعَةِ]
    #v(0.2cm)
    *الْكِتَابُ:* {t_esc(title)} \\
    *الْمُؤَلِّفُ:* {t_esc(author)} \\
    *النُّسْخَةُ:* {t_esc(prof["name_ar"])} \\
    *الضَّبْطُ وَالتَّشْكِيلُ:* مَشْرُوعُ كُتُبٍ مَشْكُولَةٍ (تَشْكِيلٌ كَامِلٌ لِتَيْسِيرِ الْقِرَاءَةِ لِطُلَّابِ الْعِلْمِ وَالْمُبْتَدِئِينَ فِي اللُّغَةِ الْعَرَبِيَّةِ).
    #v(0.2cm)
    #line(length: 100%, stroke: 0.4pt + rule-color)
    #v(0.2cm)
    الْقِرَاءَةُ الرَّقْمِيَّةُ لِهَذَا الْكِتَابِ مُتَاحَةٌ مَجَّانًا عَلَى الْمَوْقِعِ، وَيَعُودُ رَيْعُ الطَّبْعَةِ الْوَرَقِيَّةِ لِدَعْمِ تَشْكِيلِ مَزِيدٍ مِنْ كُتُبِ أَهْلِ السُّنَّةِ وَالْجَمَاعَةِ وَمُرَاجَعَتِهَا.
    #v(0.15cm)
    #text(dir: ltr, size: 9.5pt, fill: rgb("#444444"))[https://mashkula.com/{slug}/]
  ]
  #v(0.5cm)
]

#counter(page).update(1)

// ===== BODY =====
{chr(10).join(body_parts)}

// ===== TABLE OF CONTENTS =====
#pagebreak()
#heading(level: 1, outlined: false)[فِهْرِسُ الْمَوْضُوعَاتِ]
#v(0.4cm)
#context {{
  let hs = query(selector(heading.where(level: 1, outlined: true)))
  if hs.len() == 0 {{
    [—]
  }} else {{
    set text(size: 11pt)
    set par(justify: false, leading: 0.9em, spacing: 0.45em)
    for h in hs {{
      let p = counter(page).at(h.location()).first()
      link(h.location())[#h.body #box(width: 1fr, repeat[.]) #ar-digits(p)]
      linebreak()
    }}
  }}
}}
"""
    return typ


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="+", help="Book slug(s) from books.json / media-harakat-books/books/")
    ap.add_argument("--profiles", default="kdp,cairo,study", help="Comma-separated profiles: kdp,cairo,study")
    ap.add_argument("--previews", action="store_true", help="Render PNG previews of cover + interior to public/print/previews/")
    ap.add_argument("--bw", action="store_true", help="Force pure black-and-white on all profiles")
    args = ap.parse_args()

    books_json = json.load(open(SITE_ROOT / "books.json", encoding="utf-8"))
    by_slug = {b["slug"]: b for b in books_json["books"]}
    profiles = [p.strip() for p in args.profiles.split(",") if p.strip()]

    font_flags = []
    for fp in FONT_PATHS:
        if os.path.isdir(fp):
            font_flags += ["--font-path", fp]

    results = {}
    for slug in args.slugs:
        author = by_slug.get(slug, {}).get("author", "")
        title, sub, tab, blocks = parse_book(slug)
        if not author:
            author = sub
        out_dir = OUT_ROOT / slug
        out_dir.mkdir(parents=True, exist_ok=True)
        results[slug] = {}

        for pkey in profiles:
            if pkey not in PROFILES:
                raise SystemExit(f"Unknown profile: {pkey}")
            typ_src = build_typst_source(slug, title, sub, tab, author, blocks, pkey, force_bw=args.bw)
            typ_path = out_dir / f"{slug}-{pkey}.typ"
            pdf_path = out_dir / f"{slug}-{pkey}.pdf"
            typ_path.write_text(typ_src, encoding="utf-8")

            cmd = ["typst", "compile", *font_flags, str(typ_path), str(pdf_path)]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                print(f"ERROR compiling {slug} ({pkey}):\n{res.stderr}", file=sys.stderr)
                sys.exit(res.returncode)

            # Count printed pages (works with zero external dependencies)
            raw_pdf = pdf_path.read_bytes()
            npages = len(re.findall(rb"/Type\s*/Page(?![a-zA-Z])", raw_pdf))
            size_kb = pdf_path.stat().st_size // 1024
            results[slug][pkey] = {"pdf": str(pdf_path), "pages": npages, "size_kb": size_kb}
            print(f"OK {slug} [{pkey}]: {npages} pages, {size_kb} KB -> {pdf_path}")

            if args.previews and pkey in ("study", "kdp"):
                PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)
                # Render page 1 (cover) for study, and page 3 (body spread) for study & kdp
                pg_list = "1,3" if pkey == "study" else "3"
                tpl = str(PREVIEW_ROOT / f"{slug}-{pkey}-p{{p}}.png")
                pcmd = ["typst", "compile", *font_flags, "--format", "png", "--ppi", "130", "--pages", pg_list, str(typ_path), tpl]
                pres = subprocess.run(pcmd, capture_output=True, text=True)
                if pres.returncode != 0:
                    print(f"WARNING preview failed for {slug} ({pkey}): {pres.stderr}", file=sys.stderr)

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
