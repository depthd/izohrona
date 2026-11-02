import re
def parse(path):
    src = open(path, encoding='utf-8').read()
    toks = re.findall(r'"((?:[^"\\]|\\.)*)"|([{}\[\],])', src.split('\n',1)[1])
    toks = [t[0] if t[1]=='' else t[1] for t in toks]
    i = 0
    def elem(cls):
        nonlocal i
        assert toks[i]=='{'; i+=1; a=[]
        while toks[i] != '}':
            k=toks[i]; t=toks[i+1]; i+=2
            if t.endswith('_array'):
                assert toks[i]=='['; i+=1; items=[]
                while toks[i] != ']':
                    if toks[i]==',': i+=1; continue
                    if t=='element_array': c=toks[i]; i+=1; items.append(elem(c))
                    else: items.append(toks[i]); i+=1
                i+=1; a.append((k,t,items))
            elif toks[i]=='{': a.append((k,t,elem(t)))
            else: a.append((k,t,toks[i])); i+=1
        i+=1
        return {'cls':cls,'a':a}
    roots=[]
    while i < len(toks):
        c=toks[i]; i+=1; roots.append(elem(c))
    return roots
def get(e,k):
    for kk,t,v in e['a']:
        if kk==k: return v
def show(e, ind=0, out=None, maxarr=6):
    out = out if out is not None else []
    for k,t,v in e['a']:
        if k=='id': continue
        if t=='element_array':
            out.append('  '*ind+f'{k} [{len(v)}]')
            for x in v[:2]: out.append('  '*ind+f'  - {x["cls"]}'); show(x, ind+2, out, maxarr)
        elif t.endswith('_array'):
            out.append('  '*ind+f'{k}: {t} n={len(v)} {v[:maxarr]}')
        elif isinstance(v, dict):
            out.append('  '*ind+f'{k}: {t}'); show(v, ind+1, out, maxarr)
        else: out.append('  '*ind+f'{k}: {t} = {v}')
    return out
