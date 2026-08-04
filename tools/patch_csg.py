"""Финальная сборка .vmf через вычитание пересечений (v115).

Заменяет `return \\`versioninfo...\\`` на вариант, который сначала разрешает регистр
коробок (resolveREG), а потом подставляет вместо жетонов получившиеся
непересекающиеся куски.
"""
import sys

p = sys.argv[1] if len(sys.argv) > 1 else 'builds/izohrona_v115.html'
t = open(p, encoding='utf-8').read()

anchor = '  return `versioninfo'
i = t.index(anchor)
j = t.index('\n', i)
old = t[i:j].strip()
assert old.startswith('return `'), old[:40]
tmpl = old[len('return '):]

new = (
    "  /* v115. Здесь коробки превращаются в геометрию: сначала каждая вычитает из себя\n"
    "     всё, что выпущено раньше, потом жетоны в тексте заменяются на получившиеся\n"
    "     куски. Пустой список означает, что коробка была целиком внутри чужого объёма. */\n"
    "  const __parts=resolveREG();\n"
    "  let __txt = " + tmpl + "\n"
    "  let __kept=0, __dropped=0, __split=0;\n"
    "  __txt = __txt.replace(/\\u0000B(\\d+)\\u0000/g, function(_,n){\n"
    "    const ps=__parts[+n]||[];\n"
    "    if(!ps.length){ __dropped++; return ''; }\n"
    "    if(ps.length>1) __split++;\n"
    "    __kept+=ps.length;\n"
    "    return ps.map(emitAABB).join('\\n'); });\n"
    "  cur.__csg={emitted:REG.length, pieces:__kept, dropped:__dropped, split:__split};\n"
    "  return __txt.replace(/\\n{3,}/g,'\\n');"
)
t = t[:i] + new + t[j:]

old_tok = "const TOK=n=>`\\u0000B${n}\\u0000`;"
new_tok = "const TOK=n=>String.fromCharCode(0)+'B'+n+String.fromCharCode(0);"
assert old_tok in t, 'нет TOK'
t = t.replace(old_tok, new_tok, 1)

open(p, 'w', encoding='utf-8').write(t)
print('сборка через вычитание — ок')
