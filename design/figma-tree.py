# Usage: python3 design/figma-tree.py <node-id> [max-depth]  -> prints the layer tree from figma-metadata.xml
import sys, re, os
s = open(os.path.join(os.path.dirname(__file__), 'figma-metadata.xml')).read()
target, maxd = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 3
i = s.find(f'id="{target}"')
if i < 0: sys.exit('not found')
start = s.rfind('<', 0, i)
depth = 0
for m in re.finditer(r'<(/?)([a-z-]+)([^>]*?)(/?)>', s[start:]):
    close, tag, attrs, selfc = m.groups()
    if close:
        depth -= 1
        if depth <= 0: break
        continue
    if depth <= maxd:
        a = dict(re.findall(r'(\w+)="([^"]*)"', attrs))
        print('  ' * depth + f"{tag} [{a.get('id')}] {a.get('name')!r} {a.get('width')}x{a.get('height')} @({a.get('x')},{a.get('y')})")
    if selfc and depth == 0: break
    if not selfc: depth += 1
