"""Nos produits (slug, nom, références, prix d'avant promotion), depuis le flux Google du site.

Le flux (https://ledvroom.com/flux/google-shopping.xml) donne une ligne par conditionnement ; on regroupe par fiche.
`g:price` est le prix d'avant promotion : c'est lui que le barème « prix LedPerf − 5 % » a fixé.
Usage : python3 -I nos_produits.py flux.xml nos_produits.json
"""
import html
import json
import re
import sys

flux = open(sys.argv[1], encoding='utf-8').read()
par_slug = {}
for item in re.findall(r'<item>(.*?)</item>', flux, re.S):
    champ = lambda nom: (lambda m: html.unescape(m.group(1)) if m else None)(re.search(rf'<g:{nom}>(.*?)</g:{nom}>', item, re.S))
    lien = champ('link')
    if not lien or '/p/' not in lien:
        continue
    slug = lien.split('/p/', 1)[1].split('?')[0]
    prix = float(champ('price').split()[0]) if champ('price') else None
    p = par_slug.setdefault(slug, {'slug': slug, 'titre': champ('title'), 'skus': [], 'prix': [], 'type': champ('product_type')})
    p['skus'].append(champ('id'))
    if prix is not None and prix not in p['prix']:
        p['prix'].append(prix)
# Une fiche à plusieurs conditionnements a une ligne par conditionnement, titrée « Nom — Conditionnement » :
# le nom de la fiche est la partie commune.
titres = {}
for item in re.findall(r'<item>(.*?)</item>', flux, re.S):
    lien = re.search(r'<g:link>(.*?)</g:link>', item)
    titre = re.search(r'<g:title>(.*?)</g:title>', item, re.S)
    if lien and titre and '/p/' in lien.group(1):
        titres.setdefault(lien.group(1).split('/p/', 1)[1].split('?')[0], []).append(html.unescape(titre.group(1)))
for slug, liste in titres.items():
    tetes = {t.split(' — ', 1)[0] for t in liste}
    if len(liste) > 1 and len(tetes) == 1:
        par_slug[slug]['titre'] = tetes.pop()
json.dump(list(par_slug.values()), open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print(len(par_slug), 'produits', file=sys.stderr)
