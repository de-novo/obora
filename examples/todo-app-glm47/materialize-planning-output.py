#!/usr/bin/env python3
import json
from pathlib import Path
import sys

ROOT = Path('/Users/denovo/workspace/github/obora-kit/examples/todo-app-glm47')
OUT = ROOT / 'output'
DOCS = ROOT / 'docs'
DOCS.mkdir(parents=True, exist_ok=True)

mapping = {
    'requirements-collection': DOCS / '01-requirements.md',
    'requirements-analysis': DOCS / '02-analysis.md',
    'solution-discussion': DOCS / '03-discussion.md',
    'planning-review': DOCS / '04-review.md',
    'planning-validation': DOCS / '05-validation.md',
}

files = sorted(OUT.glob('todo-app-01-planning-pipeline-*.json'), key=lambda p: p.stat().st_mtime)
if not files:
    print('No planning output JSON found.', file=sys.stderr)
    sys.exit(1)

latest = files[-1]
data = json.loads(latest.read_text())
steps = data.get('stepRecords', {})

written = []
for step, target in mapping.items():
    val = steps.get(step, {}).get('output')
    if not val:
        continue
    text = str(val)
    # unwrap fenced markdown when present
    if text.strip().startswith('```markdown'):
        text = text.strip()[11:]
        if text.endswith('```'):
            text = text[:-3]
        text = text.strip() + '\n'
    target.write_text(text)
    written.append(str(target))

index = DOCS / 'INDEX.md'
index.write_text(
    '# Planning Outputs\n\n'
    f'- source run: `{data.get("id")}`\n'
    f'- source file: `{latest.name}`\n\n'
    '- [01-requirements.md](./01-requirements.md)\n'
    '- [02-analysis.md](./02-analysis.md)\n'
    '- [03-discussion.md](./03-discussion.md)\n'
    '- [04-review.md](./04-review.md)\n'
    '- [05-validation.md](./05-validation.md)\n'
)

print('Materialized files:')
for w in written:
    print('-', w)
print('Index:', index)
