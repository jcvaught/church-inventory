# COH-012 — regenerate functions/lib/entitlement.js from src/lib/entitlement.js.
# Run after ANY edit to the ESM module (`python3 scripts/entitlement-twin.py`);
# the parity test in functions/test/entitlement.test.mjs fails on drift either way.
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'src/lib/entitlement.js').read_text()
body = src.replace('export const ', 'const ').replace('export function ', 'function ')
names = re.findall(r'^export (?:const|function) ([A-Za-z_]+)', src, re.M)
head = """// COH-012 A.4 — entitlement model, SERVER TWIN of src/lib/entitlement.js.
// Cloud Functions are CommonJS and the deploy package only contains functions/,
// so this cannot import the ESM module at runtime — it carries the same code.
//
// ⚠️ GENERATED from src/lib/entitlement.js by scripts/entitlement-twin.py
// (export keywords stripped, module.exports appended). KEEP IN SYNC:
// functions/test/entitlement.test.mjs imports BOTH and asserts identical output
// across the fixture matrix. Any drift fails the test.

"""
i = body.index('const PLAN_FLAT')
(root / 'functions/lib/entitlement.js').write_text(head + body[i:] + "\nmodule.exports = { " + ", ".join(names) + " };\n")
print("functions/lib/entitlement.js regenerated:", len(names), "exports")
