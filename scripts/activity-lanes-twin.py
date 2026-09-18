# COH-012 Part B — regenerate functions/lib/activity-lanes.js from src/lib/activity-lanes.js.
# Run after ANY edit to the ESM module (`python3 scripts/activity-lanes-twin.py`);
# the parity test in functions/test/activity-lanes.test.mjs fails on drift either way.
# Same shape as scripts/entitlement-twin.py.
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'src/lib/activity-lanes.js').read_text()
body = src.replace('export const ', 'const ').replace('export function ', 'function ')
names = re.findall(r'^export (?:const|function) ([A-Za-z_]+)', src, re.M)
head = """// COH-012 Part B — activityLog timestamp lanes, SERVER TWIN of src/lib/activity-lanes.js.
// Cloud Functions are CommonJS and the deploy package only contains functions/,
// so this cannot import the ESM module at runtime — it carries the same code.
//
// ⚠️ GENERATED from src/lib/activity-lanes.js by scripts/activity-lanes-twin.py
// (export keywords stripped, module.exports appended). KEEP IN SYNC:
// functions/test/activity-lanes.test.mjs imports BOTH and asserts identical
// output across the fixture matrix. Any drift fails the test. The WHY lives in
// the ESM module's header comment.

"""
i = body.index('/**\n * The bounds')
(root / 'functions/lib/activity-lanes.js').write_text(head + body[i:] + "\nmodule.exports = { " + ", ".join(names) + " };\n")
print("functions/lib/activity-lanes.js regenerated:", len(names), "exports")
