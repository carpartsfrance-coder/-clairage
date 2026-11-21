"""Lecture d'une fiche produit LedPerf (HTML) -> dict brut. Outil d'étude."""
import html as htmlmod
import json
import re


def texte(fragment: str) -> str:
    fragment = re.sub(r'<br\s*/?>', '\n', fragment, flags=re.I)
    fragment = re.sub(r'</(p|li|div|tr|h\d)>', '\n', fragment, flags=re.I)
    fragment = re.sub(r'<[^>]+>', ' ', fragment)
    fragment = htmlmod.unescape(fragment)
    lignes = [re.sub(r'[ \t ]+', ' ', l).strip() for l in fragment.split('\n')]
    return '\n'.join(l for l in lignes if l)


def bloc(h: str, debut: int, balise: str = 'div') -> str:
    """Renvoie le contenu de la balise ouvrante trouvée à `debut`, en comptant l'imbrication."""
    ouvre = re.compile(r'<' + balise + r'\b', re.I)
    ferme = re.compile(r'</' + balise + r'\s*>', re.I)
    i = h.find('>', debut) + 1
    profondeur = 1
    pos = i
    while profondeur and pos < len(h):
        o = ouvre.search(h, pos)
        f = ferme.search(h, pos)
        if not f:
            break
        if o and o.start() < f.start():
            profondeur += 1
            pos = o.end()
        else:
            profondeur -= 1
            pos = f.end()
            if profondeur == 0:
                return h[i:f.start()]
    return h[i:pos]


def lire(h: str) -> dict:
    out = {}
    m = re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
    out['titre'] = texte(m.group(1)).replace('\n', ' ') if m else None
    m = re.search(r'"sku"\s*:\s*"([^"]+)"', h)
    out['ref'] = m.group(1) if m else None
    # Configuration : options et points du choix affiché
    conf = re.search(r'<div class="configuration"', h)
    out['options'] = []
    out['points'] = []
    if conf:
        c = bloc(h, conf.start())
        for sel in re.finditer(r'<select[^>]*aria-label="([^"]*)"[^>]*>(.*?)</select>', c, re.S):
            opts = [texte(o) for o in re.findall(r'<option[^>]*>(.*?)</option>', sel.group(2), re.S)]
            sel_opt = re.search(r'<option[^>]*selected[^>]*>(.*?)</option>', sel.group(2), re.S)
            out['options'].append({'nom': htmlmod.unescape(sel.group(1)), 'choix': opts, 'retenu': texte(sel_opt.group(1)) if sel_opt else None})
        for info in re.finditer(r'<div class="sub infoLevel"', c):
            t = texte(bloc(c, info.start()))
            out['points'] += [l.lstrip('-–• ').strip() for l in t.split('\n') if l.strip('-–• ').strip()]
    out['logos'] = [texte(x).replace('\n', ' ') for x in re.findall(r'<div class="pdt-logo-text"[^>]*>(.*?)</div>', h, re.S)]
    # Sections dépliables
    out['sections'] = []
    for item in re.finditer(r'<div class="ps-acc-item[^"]*"([^>]*)>', h):
        attrs = item.group(1)
        typ = re.search(r'data-ps-type="([^"]*)"', attrs)
        corps = bloc(h, item.start())
        titre = re.search(r'<span class="ps-acc-title">(.*?)</span>', corps, re.S)
        sec = {'type': typ.group(1) if typ else None, 'titre': texte(titre.group(1)) if titre else None}
        tab = re.findall(r'<tr>\s*<th>(.*?)</th>\s*<td>(.*?)</td>\s*</tr>', corps, re.S)
        if tab:
            sec['specs'] = [[texte(a), texte(b)] for a, b in tab]
        annees = re.findall(r'<span class="badge">(\d{4})</span>', corps)
        if annees:
            sec['annees'] = [int(a) for a in annees]
        body = re.search(r'<div class="ps-acc-body-inner">', corps)
        sec['texte'] = texte(bloc(corps, body.start())) if body else ''
        out['sections'].append(sec)
    m = re.search(r"Temps d'installation\s*:?\s*(?:</strong>)?\s*([0-9]+\s*H\s*[0-9]*|[0-9]+\s*min)", htmlmod.unescape(h), re.I)
    out['temps'] = m.group(1) if m else None
    return out


if __name__ == '__main__':
    import sys
    print(json.dumps(lire(open(sys.argv[1], encoding='utf-8', errors='replace').read()), ensure_ascii=False, indent=1))
