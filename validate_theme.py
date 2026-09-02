#!/usr/bin/env python3
"""LE BON PLAN / Theme Master static validator.

Checks, beyond plain JSON syntax:
- every section/block "type" reference resolves to a real file
- every render '<snippet>' resolves to a real file
- every settings key used in a template instance is actually declared in
  the target block/section's schema
- every select/radio setting's VALUE is one of the schema's declared options
- {% schema %} blocks are valid JSON and balanced

Exit code is non-zero if any problem is found.
"""
import json, glob, re, os, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
os.chdir(ROOT)


def extract_schema(path):
    content = open(path, encoding="utf-8").read()
    m = re.search(r"\{%-?\s*schema\s*-?%\}(.*?)\{%-?\s*endschema\s*-?%\}", content, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception as e:
        return {"__error__": str(e)}


section_files = set(os.path.splitext(os.path.basename(f))[0] for f in glob.glob("sections/*.liquid"))
block_files = set(os.path.splitext(os.path.basename(f))[0] for f in glob.glob("blocks/*.liquid"))
snippet_files = set(os.path.splitext(os.path.basename(f))[0] for f in glob.glob("snippets/*.liquid"))

problems = []


def schema_index(files, kind):
    ids, options = {}, {}
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        sch = extract_schema(f)
        if sch is None:
            continue
        if "__error__" in sch:
            problems.append(f"[schema-json] {f}: {sch['__error__']}")
            continue
        id_set = set()
        opt_map = {}
        for s in sch.get("settings", []):
            if "id" not in s:
                continue
            id_set.add(s["id"])
            if s.get("type") in ("select", "radio") and "options" in s:
                opt_map[s["id"]] = set(o["value"] for o in s["options"] if "value" in o)
        ids[name] = id_set
        options[name] = opt_map
    return ids, options


block_ids, block_options = schema_index(glob.glob("blocks/*.liquid"), "block")
section_ids, section_options = schema_index(glob.glob("sections/*.liquid"), "section")


def check_instance(kind, name, settings, path):
    ids = block_ids.get(name) if kind == "block" else section_ids.get(name)
    opts = block_options.get(name) if kind == "block" else section_options.get(name)
    if ids is None:
        return
    for sid, val in (settings or {}).items():
        if sid not in ids:
            problems.append(f"[unknown-setting] {path}: {kind} '{name}' has no setting '{sid}'")
            continue
        if opts and sid in opts and isinstance(val, str) and not val.startswith("{{"):
            if val not in opts[sid]:
                problems.append(f"[bad-option] {path}: {kind} '{name}' setting '{sid}' = '{val}' not in {sorted(opts[sid])}")


def walk_blocks(blocks, order, path):
    for key in (order or blocks.keys()):
        b = blocks.get(key)
        if not b:
            continue
        t = b.get("type")
        if t and not t.startswith("@") and t not in block_files:
            problems.append(f"[missing-block-file] {path}/{key}: type '{t}' has no blocks/{t}.liquid")
        check_instance("block", t, b.get("settings"), f"{path}/{key}")
        if isinstance(b.get("blocks"), dict):
            walk_blocks(b["blocks"], b.get("block_order"), f"{path}/{key}")


for tpl in glob.glob("templates/*.json") + glob.glob("sections/*group*.json") + glob.glob("presets/**/*.json", recursive=True):
    try:
        d = json.load(open(tpl, encoding="utf-8"))
    except Exception as e:
        problems.append(f"[invalid-json] {tpl}: {e}")
        continue
    for skey, s in d.get("sections", {}).items():
        stype = s.get("type")
        if stype and stype not in section_files:
            problems.append(f"[missing-section-file] {tpl}/{skey}: type '{stype}' has no sections/{stype}.liquid")
        check_instance("section", stype, s.get("settings"), f"{tpl}/{skey}")
        if isinstance(s.get("blocks"), dict):
            walk_blocks(s["blocks"], s.get("block_order"), f"{tpl}/{skey}")

render_pattern = re.compile(r"""\{%-?\s*render\s+'([^']+)'""")
doc_or_comment_pattern = re.compile(
    r"\{%-?\s*doc\s*-?%\}.*?\{%-?\s*enddoc\s*-?%\}"
    r"|\{%-?\s*comment\s*-?%\}.*?\{%-?\s*endcomment\s*-?%\}",
    re.S,
)
for f in glob.glob("**/*.liquid", recursive=True):
    content = open(f, encoding="utf-8").read()
    # Strip {% doc %}/{% comment %} blocks first: an @example render call or a
    # commented-out reference inside one is documentation, not executed code.
    code_only = doc_or_comment_pattern.sub("", content)
    for m in render_pattern.finditer(code_only):
        if m.group(1) not in snippet_files:
            problems.append(f"[missing-snippet] {f}: render '{m.group(1)}'")
    o = len(re.findall(r"\{%-?\s*schema\s*-?%\}", content))
    c = len(re.findall(r"\{%-?\s*endschema\s*-?%\}", content))
    if o != c:
        problems.append(f"[schema-tag-mismatch] {f}: {o} open vs {c} close")

for f in glob.glob("**/*.json", recursive=True):
    if f.startswith("locales/en.default"):
        continue  # Shopify's own default locale files ship a leading /* */ comment; not an error.
    try:
        json.load(open(f, encoding="utf-8"))
    except Exception as e:
        problems.append(f"[invalid-json] {f}: {e}")

if problems:
    print(f"{len(problems)} problem(s) found:\n")
    for p in problems:
        print(" -", p)
    sys.exit(1)
else:
    print("Validator: 0 problems found.")
