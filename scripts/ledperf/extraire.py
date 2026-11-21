"""Fiche LedPerf (HTML en cache) -> relevé compact : titre, prix, années, atouts (codes), specs, composition,
montage, notice. Les codes d'atouts sont traduits côté site par src/lib/caracteristiques.ts."""
import gzip
import html as H
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lire import bloc, texte  # noqa: E402

PICTOS = {
    'sans erreur odb': 'SANS_ERREUR', 'anti erreur odb': 'SANS_ERREUR',
    'installation plug & play': 'PLUG_PLAY', 'installation facile': 'MONTAGE_FACILE',
    'sur alimentation 12v': 'TENSION_12', 'sur alimentation 12v et 24v': 'TENSION_12_24', '12v moto': 'TENSION_12',
    'haute puissance': 'HAUTE_PUISSANCE', 'tres haute puissance': 'TRES_HAUTE_PUISSANCE',
    'long life product': 'LONGUE_DUREE', 'couleur blanc pur': 'BLANC_PUR', 'couleur blanc froid': 'BLANC_FROID',
    'couleur blanc neutre': 'BLANC_NEUTRE', 'haute qualite': 'HAUTE_QUALITE', 'rayonnement 360°': 'RAYONNEMENT_360',
    'anti courant residuel': 'ANTI_RESIDUEL', 'sur alimentation 24v': 'TENSION_24',
}
# Pictos qui ne passent jamais : promesses de service (les nôtres diffèrent), marque d'un autre. L'homologation
# route (« circulation sur route ouverte autorisée », « homologué ECE », « non ECE - circuit… ») est lue à part.
PICTOS_IGNORES = {'satisfait ou rembourse', 'garantie', 'garantie 5 ans', 'garantie a vie', 'port offert',
                  'qualite allemande',
                  'puissance standard', 'puissance basse', 'rayonnement 280°', 'rayonnement 180°',
                  'rayonnement 180° de cote'}

# Phrases courtes (points de la configuration, « Autres informations ») -> codes.
MOTIFS = [
    (r'(aucune|sans|anti)[\s-]*err+eu?r\s*(odb|obd)', 'SANS_ERREUR'),
    (r'aucune modification|changement est standard|plug\s*(&|and|n)\s*play', 'PLUG_PLAY'),
    (r'\bloupe\b|lentille', 'LOUPE'),
    (r'ultra brillant|tres lumineu|fort eclairage|ultra puissant', 'TRES_LUMINEUX'),
    (r'intensite optimale de jour|visibles? de jour', 'VISIBLE_JOUR'),
    (r'waterpoof|waterproof|100\s*% etanche|parfaitement etanche', 'ETANCHE'),
    (r'embase metallique|base metallique', 'EMBASE_METAL'),
    (r'faisceau (ajustable|reglable)', 'FAISCEAU_REGLABLE'),
    (r'\bcanbus\b', 'CANBUS'),
    (r'ventilateur|ventilee', 'VENTILE'),
]

SPECS_IGNOREES = re.compile(r'^(marque|garantie|gamme|homolog|double homolog|triple homolog|reference produit|'
                            r'compatibilite|conditionnement|vendu par|autres informations)', re.I)


def sans_accent(s: str) -> str:
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()


def codes_phrase(phrase: str) -> set:
    p = sans_accent(phrase)
    if re.search(r'necessit|requi|module anti|si (vous|votre)', p):
        return set()  # « nécessite un module anti-erreur » : surtout pas « sans erreur »
    return {code for motif, code in MOTIFS if re.search(motif, p)}


# Phrases de présentation qui disent la même chose qu'un picto.
PRESENTATION = [
    (r"changement est standard|placer les ampoules dans les supports d.origine|se mont\w* (dans|sur) les supports "
     r"d.origine|a la place des ampoules (existantes|d.origine)", 'PLUG_PLAY'),
    (r"sans (aucune )?erreur (odb|obd|au tableau de bord)", 'SANS_ERREUR'),
]


def codes_presentation(texte_section: str) -> set:
    codes = set()
    for phrase in re.split(r'(?<=[.!?])\s+|\n', sans_accent(texte_section)):
        if re.search(r'necessit|requi|module anti|si (vous|votre)', phrase):
            continue
        codes |= {code for motif, code in PRESENTATION if re.search(motif, phrase)}
    return codes


def minutes(t):
    if not t:
        return None
    m = re.match(r'(\d+)\s*H\s*(\d*)', t, re.I)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2) or 0)
    m = re.match(r'(\d+)\s*min', t, re.I)
    return int(m.group(1)) if m else None


def extraire(h: str, url: str) -> dict:
    r = {'url': url, 'id': int(re.search(r'-p-(\d+)\.html', url).group(1))}
    m = re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
    r['titre'] = texte(m.group(1)).replace('\n', ' ') if m else None
    m = re.search(r'"offers"\s*:\s*\{[^}]*?"price"\s*:\s*"([\d.]+)"', h, re.S)
    r['prix'] = round(float(m.group(1)) * 100) if m else None
    m = re.search(r'"sku"\s*:\s*"([^"]+)"', h)
    r['ref'] = m.group(1) if m else None

    atouts, inconnus = set(), []
    # Homologation routière : chaque indice vote ; deux indices contraires = on ne sait pas (rien n'est affiché).
    votes = set()
    for x in re.findall(r'<div class="pdt-logo-text"[^>]*>(.*?)</div>', h, re.S):
        cle = sans_accent(texte(x).replace('\n', ' ')).strip()
        if cle in ('circulation sur route ouverte autorisee', 'homologue ece') or re.search(r'homologation ece\s*:\s*oui', cle):
            votes.add('oui')
            continue
        if cle.startswith('non ece'):
            votes.add('non')
        if cle in PICTOS:
            atouts.add(PICTOS[cle])
        elif cle not in PICTOS_IGNORES:
            inconnus.append(cle)
    if r['titre'] and re.search(r'sans erreur (odb|obd)', sans_accent(r['titre'])):
        atouts.add('SANS_ERREUR')

    conf = re.search(r'<div class="configuration"', h)
    points = []
    if conf:
        c = bloc(h, conf.start())
        for info in re.finditer(r'<div class="sub infoLevel"', c):
            t = texte(bloc(c, info.start()))
            points += [l.lstrip('-–• ').strip() for l in t.split('\n') if l.strip('-–• ').strip()]
    for p in points:
        atouts |= codes_phrase(p)

    specs, composition, annees, vehicule, notice, homologation = [], [], None, None, False, None
    usage = None
    for cle in inconnus:
        if cle.startswith('non ece - circuit'):
            usage = 'circuit'
        elif cle.startswith('non ece - interieur'):
            usage = 'interieur'
    inconnus = [c for c in inconnus if not c.startswith('non ece')]
    for item in re.finditer(r'<div class="ps-acc-item[^"]*"([^>]*)>', h):
        corps = bloc(h, item.start())
        titre = re.search(r'<span class="ps-acc-title">(.*?)</span>', corps, re.S)
        titre = texte(titre.group(1)) if titre else ''
        t = sans_accent(titre)
        if re.search(r'fichier de montage|notice de branchement|pdf de montage', t):
            notice = True
        for a, b in re.findall(r'<tr>\s*<th>(.*?)</th>\s*<td>(.*?)</td>\s*</tr>', corps, re.S):
            a, b = texte(a).replace('\n', ' '), texte(b).replace('\n', ' / ')
            if re.match(r'autres informations', sans_accent(a)):
                for morceau in re.split(r'\s*/\s*', b):
                    atouts |= codes_phrase(morceau)
                continue
            if re.match(r'anti-?erreur odb', sans_accent(a)) and re.match(r'oui', sans_accent(b)):
                atouts.add('SANS_ERREUR')
            la, lb = sans_accent(a), sans_accent(b)
            if re.match(r'homologu?e? route|homologation sur route|homologation( ece)?$|homologue ece', la):
                # « CE », « CE et RoHS » : un marquage, pas une homologation routière. « Oui / Non » : selon l'option.
                oui = bool(re.search(r'\boui\b|\bece\b|\be\d{1,2}\b|\br\d{2,3}\b', lb))
                non = bool(re.search(r'\bnon\b', lb))
                if oui != non:
                    votes.add('oui' if oui else 'non')
            if re.match(r'(double|triple) homologation', la):
                votes.add('oui')
            if SPECS_IGNOREES.match(sans_accent(a)):
                continue
            if a and b:
                specs.append([a, b])
        an = re.findall(r'<span class="badge">(\d{4})</span>', corps)
        if an:
            annees = [min(map(int, an)), max(map(int, an))]
            st = re.search(r'<p class="subtitle">(.*?)</p>', corps, re.S)
            vehicule = texte(st.group(1)) if st else None
        if re.match(r'composition du pack', t):
            body = re.search(r'<div class="ps-acc-body-inner">', corps)
            if body:
                lignes = [l.strip().lstrip('-–• ').strip() for l in texte(bloc(corps, body.start())).split('\n')]
                composition = [l for l in lignes if l and len(l) <= 140][:15]
        if re.match(r'(presentation|pour votre vehicule)', t):
            body = re.search(r'<div class="ps-acc-body-inner">', corps)
            if body:
                atouts |= codes_presentation(texte(bloc(corps, body.start())))
        if re.match(r'(donnees fabricant|avantages)', t):
            body = re.search(r'<div class="ps-acc-body-inner">', corps)
            if body:
                for l in texte(bloc(corps, body.start())).split('\n'):
                    atouts |= codes_phrase(l)
    homologation = votes.pop() if len(votes) == 1 else None
    if re.search(r'<li class="notice">', h):
        notice = True
    m = re.search(r"Temps d'installation\s*:?\s*(?:</strong>)?\s*([0-9]+\s*H\s*[0-9]*|[0-9]+\s*min)", H.unescape(h), re.I)
    r.update({
        'atouts': sorted(atouts), 'specs': specs, 'composition': composition,
        'montage': minutes(m.group(1)) if m else None, 'notice': notice,
        'annees': annees, 'vehicule': vehicule, 'pictos_inconnus': inconnus,
        'homologation': homologation, 'usage': usage,
    })
    return r


def depuis_cache(dossier: str):
    for f in sorted(os.listdir(dossier)):
        if not (f.startswith('p') and f.endswith('.html.gz')):
            continue
        h = gzip.open(os.path.join(dossier, f), 'rt', encoding='utf-8', errors='replace').read()
        m = re.search(r'<link rel="canonical" href="([^"]+-p-\d+\.html)"', h)
        url = m.group(1) if m else 'https://www.ledperf.com/x-p-%s.html' % f[1:-8]
        try:
            yield extraire(h, url)
        except Exception as e:  # une fiche illisible ne bloque pas les autres
            yield {'url': url, 'erreur': str(e)}


if __name__ == '__main__':
    n = 0
    with open(sys.argv[2], 'w', encoding='utf-8') as out:
        for r in depuis_cache(sys.argv[1]):
            out.write(json.dumps(r, ensure_ascii=False) + '\n')
            n += 1
    print('fiches', n)
