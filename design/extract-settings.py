# Extracts settings pages from figma-metadata.xml into settings-extract.json (sections -> rows -> control).
import re, json, html, os
s = open(os.path.join(os.path.dirname(__file__), 'figma-metadata.xml')).read()
tops = []
depth = 0
nodes = []  # (top_index, depth, tag, attrs)
for m in re.finditer(r'<(/?)([a-z-]+)([^>]*?)(/?)>', s):
    close, tag, attrs, selfc = m.groups()
    if close:
        depth -= 1; continue
    a = {k: html.unescape(v) for k, v in re.findall(r'(\w+)="([^"]*)"', attrs)}
    if depth == 1: tops.append(a)
    if depth >= 1: nodes.append((len(tops) - 1, depth, tag, a))
    if not selfc: depth += 1

def page(idx):
    items = [n for n in nodes if n[0] == idx][1:]
    title = None; sections = []; cur = None; row = None
    for _, d, tag, a in items:
        name, h, x = a.get('name', ''), float(a.get('height', 0)), float(a.get('x', 0))
        if tag == 'text' and title is None and h == 19 and x == 32: title = name; continue
        if tag == 'text' and h == 19 and x == 0:
            cur = {'section': name, 'rows': []}; sections.append(cur); row = None; continue
        if cur is None: continue
        if tag == 'text' and h == 17 and x == 0 and float(a.get('y', 0)) < 1:
            row = {'label': name, 'control': None, 'values': []}; cur['rows'].append(row); continue
        if row is None:
            if name == 'Advanced Options': cur['rows'].append({'label': 'Advanced Options', 'control': 'link', 'values': []})
            continue
        if row['control'] is None:
            if tag == 'instance' and name == 'Toggle': row['control'] = 'toggle'
            elif name == 'Dropdown': row['control'] = 'dropdown'
            elif name in ('wrapper', 'range'): row['control'] = 'slider'
        if tag == 'text':
            if name in ('Browse',): row['control'] = row['control'] or 'path'
            row['values'].append(name)
        if tag == 'instance' and name in ('Values',): row['control'] = row['control'] or 'number'
    return title, sections

out = {}
for i, t in enumerate(tops):
    if t.get('name', '').startswith('Settings - '):
        title, sections = page(i)
        out[f"{t['name']} [{t['id']}]"] = {'title': title, 'sections': sections}
json.dump(out, open(os.path.join(os.path.dirname(__file__), 'settings-extract.json'), 'w'), indent=1)
for k, v in out.items():
    print(f"\n## {k} — {v['title']}")
    for sec in v['sections']:
        print(f"  [{sec['section']}]")
        for r in sec['rows']:
            vals = ', '.join(r['values'][:12])
            print(f"    - {r['label']} :: {r['control']} :: {vals}")
