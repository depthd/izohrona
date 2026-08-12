"""Синтаксическая проверка сборки: скрипты вырезаются в один файл для node --check.
   Дешевле, чем ждать пятиминутный таймаут playwright на сломанной странице.
       python3 tools/syncheck.py builds/izohrona_v139.html && node --check /tmp/build.js
"""
import re, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'builds/izohrona_v139.html'
h = open(p, encoding='utf-8').read()
s = [m.group(1) for m in re.finditer(r'<script[^>]*>([\s\S]*?)</script>', h)]
open('/tmp/build.js', 'w', encoding='utf-8').write('\n'.join(s))
sys.stderr.write(f'скриптов {len(s)}, символов {sum(len(x) for x in s)}\n')
