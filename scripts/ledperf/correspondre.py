"""Rapprochement produit LEDVROOM -> fiche LedPerf, par le titre (TF-IDF), le véhicule, les années, la nature du
produit et le prix.

Usage : python3 -I correspondre.py releves.jsonl correspondance.json   (lit nos_produits.json dans le dossier courant)

Le prix est le meilleur témoin : le catalogue a été tarifé « prix LedPerf − 5 %, arrondi à ,90 » (packs : prix
relevé conservé dans priceSourceCents). Un titre proche ET un prix cohérent = rapprochement sûr.
"""
import json
import os
import re
import sys
import unicodedata

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

VIDES = set('pour de du des d la le les l a au aux et en sur avec par un une votre vos'.split())
SYN = {
    'leds': 'led', 'ampoules': 'ampoule', 'clignotants': 'clignotant', 'feux': 'feu', 'phares': 'phare',
    'antibrouillards': 'antibrouillard', 'repetiteurs': 'repetiteur', 'lateraux': 'lateral',
    'dynamiques': 'dynamique', 'additionnels': 'additionnel', 'dorigine': 'origine', 'declairage': 'eclairage',
    'modules': 'module', 'veilleuses': 'veilleuse', 'kits': 'kit', 'optiques': 'optique', 'barres': 'barre',
    'interieur': 'habitacle', 'effects': 'effet', 'effect': 'effet', 'benz': '', 'vw': 'volkswagen',
    'arrieres': 'arriere', 'retroviseurs': 'retroviseur', 'immatriculation': 'plaque',
    # Couleurs : une LED rouge n'est pas une LED verte, le mot doit se retrouver (voir TYPE).
    'blanche': 'blanc', 'blanches': 'blanc', 'blancs': 'blanc', 'rouges': 'rouge', 'verte': 'vert', 'vertes': 'vert',
    'verts': 'vert', 'bleue': 'bleu', 'bleues': 'bleu', 'bleus': 'bleu', 'jaunes': 'jaune', 'oranges': 'orange',
    'violette': 'violet', 'violettes': 'violet', 'violets': 'violet',
}
ANNEES = re.compile(r'\(?\b(19[5-9]\d|20[0-4]\d)\b\s*(?:[-–]\s*\b(19[5-9]\d|20[0-4]\d|\.\.\.)?\b)?\)?')


def sans_accent(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()


def annees(titre):
    m = re.search(r'\((\d{4})\s*[-–]\s*(\d{4})\)', titre or '')
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r'\((\d{4})\s*[-–]\s*\)', titre or '') or re.search(r'\(depuis (\d{4})\)', titre or '')
    if m:
        return int(m.group(1)), 2030
    return None


def norm(titre):
    t = sans_accent(titre or '')
    t = re.sub(r'\((?:\d{4}\s*[-–]\s*\d{4}|\d{4}\s*[-–]\s*|depuis \d{4})\)', ' ', t)
    t = re.sub(r"[’'`]", ' ', t)
    t = re.sub(r'\b\d+(?:[.,]\d+)?\s*pouces?\b', ' ', t)  # « optique LED 7 pouces » : la taille, pas le véhicule
    mots = []
    for m in re.split(r'[^a-z0-9]+', t):
        if not m or m in VIDES:
            continue
        m = SYN.get(m, m)
        if m:
            mots.append(m)
    return ' '.join(mots)


TYPE = set('''pack led ampoule veilleuse phare feu jour route croisement recul plaque clignotant avant arriere habitacle
plafonnier antibrouillard xenon effet kit hid bi module eclairage blanc pur luxe full dynamique repetiteur lateral
retroviseur conversion origine additionnel longue portee large proximite flood spot moto canbus sans erreur odb obd
haute performance puissance ballast type optique rond ronde barre centrale sequentiel sequentiels plug play mini nano
technology ventilee ventile w 35w 55w taille 6000k 5000k 4300k 8000k 3000k 12v 24v cote gauche droit droite
feux stop position lumiere couleur super diamond intense cool white xtrem extra slim
fast start paire unite lot set chrome chromee noir noire fumee claire transparent transparente leds smd cob csp
canbus anti residuel connecteur adaptateur support supports capuchon capuchons cache caches avec qualite standard
universel universelle universels universelles homologuee homologuees homologue osram philips night breaker
compteur tableau bord afficheur boitier'''.split())


def cles(norme):
    return [m for m in norme.split() if m not in TYPE]


def vehicule_ok(nos_norme, lp_norme):
    nos_cles = cles(nos_norme)
    if not nos_cles:
        return None  # rien de distinctif à vérifier (produit générique)
    colle = lp_norme.replace(' ', '')
    lp_mots = set(lp_norme.split())
    # Un mot doit se retrouver entier ; seuls les mots mêlant chiffres et lettres (« v1 » dans « v1v2 ») peuvent
    # se retrouver collés.
    presents = sum(1 for m in nos_cles if m in lp_mots or (re.search(r'\d', m) and len(m) >= 2 and m in colle))
    return presents / len(nos_cles) >= 0.85


# Emplacement ou nature du produit, sur le titre sans accents. Deux titres aux étiquettes différentes ne désignent pas
# le même produit (« clignotants » contre « clignotants arrière », « + feux stop » contre « + feux de jour »,
# « effet xénon » contre LED…). Seules exceptions, nos titres plus courts que ceux de LedPerf : « feux de jour »
# pour « feux de jour / veilleuses », « feux de jour » pour « feux de jour et de route ».
ETIQUETTES = [
    ('antibrouillard_ar', r'anti ?brouillards? arriere'),
    ('antibrouillard', r'anti ?brouillard'),
    ('plaque', r'plaque'),
    ('recul', r'recul'),
    ('veilleuse', r'veilleuse'),
    ('feu_jour', r'feux? de jour|diurne|\bdrl\b'),
    ('route', r'feux? de route|feux? de jour et de route'),
    ('habitacle', r'habitacle|interieur|plafonnier'),
    ('xenon_origine', r'ampoules? (de )?xenon d ?origine'),
    ('xenon_led', r'led.{0,40}phares? xenon|conversion du xenon|xenon en led'),
    ('effet_xenon', r'effet xenon|xenon effects?'),
    ('hid', r'\bhid\b|kit (bi )?xenon'),
    ('bi_xenon', r'bi ?xenon'),
    ('bi_led', r'bi ?led'),
    ('ballast', r'ballast'),
    ('additionnel', r'additionnel|longue portee'),
    ('stop', r'feux? stop|feux? arriere'),
    ('centrale', r'centrale|relais de clignotant'),
    ('dynamique', r'dynamique|sequentiel'),
    ('clignotant_ar', r'clignotants? arriere'),
    ('repetiteur', r'repetiteur|retroviseur'),
    ('compteur', r'compteur|tableau de bord|afficheur'),
    ('angel_eyes', r'angel eyes'),
    ('essuie', r'essuie'),
    ('chrome', r'chrom'),
    ('un_cote', r'\bcote (gauche|droit|conducteur|passager)|\((gauche|droit|droite)\)'),
]


def etiquettes(titre):
    t = re.sub(r"[’'`\-]", ' ', sans_accent(titre or ''))
    t = re.sub(r'\s+', ' ', t)
    e = {nom for nom, motif in ETIQUETTES if re.search(motif, t)}
    if 'antibrouillard_ar' in e:
        e.discard('antibrouillard')
    if re.search(r'clignotant', t) and not re.search(r'arriere|dynamique|sequentiel|repetiteur|retroviseur|centrale|relais', t):
        e.add('clignotant_av')
    return e


def types_ok(nos_titre, lp_titre):
    # Nos « Modules LED de plaque » sont des modules complets : une fiche LedPerf d'ampoules ne leur correspond pas.
    # L'inverse arrive (« Pack LED éclairage de plaque » relevé sur des modules LedPerf), il est permis.
    if re.search(r'\bmodules? (de )?led', sans_accent(nos_titre or '')) and not re.search(r'\bmodules?\b', sans_accent(lp_titre or '')):
        return False
    # De même pour nos kits « taille mini » ; nos « kits ampoules LED phares » viennent, eux, de l'une ou l'autre
    # fiche LedPerf (le prix tranche).
    if re.search(r'taille mini', sans_accent(nos_titre or '')) and not re.search(r'taille mini', sans_accent(lp_titre or '')):
        return False
    a, b = etiquettes(nos_titre), etiquettes(lp_titre)
    if 'feu_jour' in a | b:
        a.discard('veilleuse'), b.discard('veilleuse')
    if 'feu_jour' in a and 'feu_jour' in b:
        a.discard('route'), b.discard('route')
    return a == b


def multi_vehicules(lp_titre):
    """Une fiche LedPerf commune à plusieurs véhicules (« pour Seat Leon 2 (1P) (2005 - 2012) / Altea ») peut
    correspondre à plusieurs de nos produits, un par véhicule."""
    apres = sans_accent(lp_titre or '').split(' pour ', 1)
    return len(apres) == 2 and ' / ' in apres[1]


def attendu(lp_cents):
    """Prix LEDVROOM d'avant promotion pour un prix LedPerf : −5 %, arrondi au ,90 le plus proche, strictement
    inférieur (règle de packs-vehicule.json)."""
    x = lp_cents * 0.95
    base = round((x - 90) / 100) * 100 + 90
    if base >= lp_cents:
        base -= 100
    return base


def main(releves_path, sortie):
    nos = json.load(open('nos_produits.json'))
    # Packs véhicule : le prix LedPerf relevé à la création est conservé (priceSourceCents).
    depot = os.environ.get('DEPOT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
    packs = {}
    for f in [os.path.join(depot, 'prisma', 'packs-vehicule.json'),
              os.path.join(depot, 'prisma', 'packs-vehicule-complement.json')]:
        for p in json.load(open(f))['packs']:
            packs[p['slug']] = p.get('priceSourceCents')
    lp = [json.loads(l) for l in open(releves_path)]
    lp = [r for r in lp if 'erreur' not in r and r.get('titre')]
    print('fiches LedPerf', len(lp), file=sys.stderr)
    par_id = {r['id']: r for r in lp}

    a = [norm(p['titre']) for p in nos]
    b = [norm(r['titre']) for r in lp]
    mots = TfidfVectorizer(analyzer='word', token_pattern=r'[a-z0-9]+', sublinear_tf=True).fit(a + b)
    car = TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 4), sublinear_tf=True).fit(a + b)
    A1, B1, A2, B2 = mots.transform(a), mots.transform(b), car.transform(a), car.transform(b)

    candidats, pas = [], 1500
    for i in range(0, len(nos), pas):
        s = (0.55 * (A1[i:i + pas] @ B1.T) + 0.45 * (A2[i:i + pas] @ B2.T)).toarray()
        top = np.argsort(-s, axis=1)[:, :30]
        for k, ligne in enumerate(top):
            p = nos[i + k]
            nos_an = annees(p['titre'])
            source = packs.get(p['slug'])
            meilleurs = []
            for j in ligne:
                r = lp[j]
                cos = float(s[k, j])
                lp_an = tuple(r['annees']) if r.get('annees') else annees(r['titre'])
                conflit = bool(nos_an and lp_an and (nos_an[1] < lp_an[0] or lp_an[1] < nos_an[0]))
                recouvre = bool(nos_an and lp_an and not conflit)
                iou = 0.0
                if recouvre:
                    inter = min(nos_an[1], lp_an[1]) - max(nos_an[0], lp_an[0]) + 1
                    union = max(nos_an[1], lp_an[1]) - min(nos_an[0], lp_an[0]) + 1
                    iou = max(0.0, inter / union)
                prix_ok = False
                if r.get('prix'):
                    if source:
                        prix_ok = abs(r['prix'] - source) <= 100
                    if not prix_ok:
                        att = attendu(r['prix'])
                        prix_ok = any(abs(round(x * 100) - att) <= 110 for x in p['prix'])
                vok = vehicule_ok(a[i + k], b[j])
                if vok is False or not types_ok(p['titre'], r['titre']):
                    conflit = True  # pas le même véhicule, pas la même référence, ou pas le même emplacement
                score = cos + 0.15 * iou - (0.35 if conflit else 0)
                meilleurs.append((score, cos, prix_ok, recouvre, conflit, r['id'], r['url']))
            sans_conflit = sorted([m for m in meilleurs if not m[4]], key=lambda m: -m[0])
            for rang, m in enumerate(sans_conflit):
                sc, cos, prix_ok, recouvre, conflit, lp_id, url = m
                autres = [x for x in sans_conflit if x[5] != lp_id]
                second = autres[0][0] if autres else 0
                if prix_ok and cos >= 0.45:
                    conf = 'exacte'
                elif rang == 0 and cos >= 0.90 and sc - second >= 0.05:
                    conf = 'forte'  # pas de prix cohérent : un titre presque identique, nettement devant
                else:
                    continue
                candidats.append((sc + (0.2 if conf == 'exacte' else 0), p['slug'], lp_id, {
                    'id': lp_id, 'url': url, 'cos': round(cos, 3), 'prix_ok': prix_ok, 'annees_ok': recouvre,
                    'marge': round(sc - second, 3), 'confiance': conf,
                    'titre': p['titre'], 'titre_lp': par_id[lp_id]['titre'],
                }))
        print(i, file=sys.stderr, flush=True)
    # Attribution : le meilleur couple d'abord ; une fiche LedPerf ne sert qu'à un seul de nos produits, sauf fiche
    # commune à plusieurs véhicules. Le produit qui perd sa fiche prend son candidat suivant.
    candidats.sort(key=lambda c: -c[0])
    res, prises = {}, set()
    for score, slug, lp_id, info in candidats:
        if slug in res or (lp_id in prises and not multi_vehicules(info['titre_lp'])):
            continue
        res[slug] = info
        prises.add(lp_id)
    for p in nos:
        res.setdefault(p['slug'], {'confiance': None, 'titre': p['titre']})
    json.dump(res, open(sortie, 'w'), ensure_ascii=False)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
