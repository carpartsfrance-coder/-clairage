"""Écrit les migrations de données qui remplissent "ReleveFiche".

Entrées : le relevé (extraire.py) et le rapprochement (correspondre.py).
Sortie : prisma/migrations/<horodatage>_releve_fiche_lot<NN>/migration.sql, des lots d'environ 1,4 Mo comme les
autres migrations de données du dépôt. Chaque lot est une seule instruction (tout ou rien), rejouable : un produit
déjà relevé est mis à jour.

Ce qui est écrit pour un produit (`DonneesReleve`, lib/caracteristiques.ts) : les codes d'atouts, les caractéristiques
[libellé, valeur], la composition, le temps de montage, la notice, l'homologation route et l'usage limité annoncés.

Usage : python3 -I generer_migrations.py releves.jsonl correspondance.json <dossier migrations> <horodatage> <date>
   ex.  python3 -I generer_migrations.py releves.jsonl correspondance.json ../../prisma/migrations 20261122010000 2026-11-22
"""
import json
import os
import sys

TAILLE_LOT = 1_400_000


def donnees_de(r):
    d = {'v': 1}
    if r.get('atouts'):
        d['atouts'] = sorted(set(r['atouts']))
    if r.get('specs'):
        d['specs'] = [[l, v] for l, v in r['specs']]
    if r.get('composition'):
        d['composition'] = r['composition']
    if r.get('montage'):
        d['montage'] = int(r['montage'])
    if r.get('notice'):
        d['notice'] = True
    utile = len(d) > 1
    if r.get('homologation') in ('oui', 'non'):
        d['homologue'] = r['homologation'] == 'oui'
    if r.get('usage'):
        d['usage'] = r['usage']
    return d if utile else None


def litteral(obj):
    texte = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    assert '\x00' not in texte
    return "'" + texte.replace("'", "''") + "'"


def sql_du_lot(lignes, fiches, numero, total, date, nb_produits):
    entete = f"""-- Caractéristiques des produits relevées sur leur fiche LedPerf, lot {numero}/{total} ({nb_produits} produits).
--
-- Décision de l'exploitant (21 novembre 2026) : « tous les produits du site sont exactement comme LedPerf ;
-- mets les mêmes caractéristiques et informations : s'il n'y a pas d'erreur OBD, c'est pareil, si c'est plug and
-- play, c'est pareil », et « fais-en des badges ». Relevé hors ligne de chaque fiche produit LedPerf le {date}
-- (scripts/ledperf/), rapprochée de notre produit par le nom, le véhicule, les années et le prix.
--
-- Rien n'est affiché tel quel : lib/caracteristiques.ts en tire les badges, la liste des atouts, le tableau des
-- caractéristiques et des réponses de la FAQ, avec nos mots et nos règles (pas de référence d'ampoule sur un pack
-- véhicule, pas de marque, pas de promesse de service qui serait la leur). L'homologation route est dite comme chez
-- eux, et « homologué route » mis en avant (exploitant, 21 novembre 2026). Ce qui est saisi au back-office l'emporte.
-- Rejouable : un produit déjà relevé est mis à jour.
"""
    corps = (
        'INSERT INTO "ReleveFiche" ("productId", "source", "donnees", "releveLe", "confiance")\n'
        f'SELECT p."id", x.u, f.d, TIMESTAMP \'{date} 00:00:00\', x.c\n'
        f'FROM json_to_recordset({litteral(lignes)}) AS x(s text, u text, n int, c text)\n'
        f'JOIN json_to_recordset({litteral(fiches)}) AS f(n int, d jsonb) ON f.n = x.n\n'
        'JOIN "Product" p ON p."slug" = x.s\n'
        'ON CONFLICT ("productId") DO UPDATE SET\n'
        '  "source" = EXCLUDED."source",\n'
        '  "donnees" = EXCLUDED."donnees",\n'
        '  "releveLe" = EXCLUDED."releveLe",\n'
        '  "confiance" = EXCLUDED."confiance";\n'
    )
    return entete + '\n' + corps


def main(releves_path, corr_path, dossier, horodatage, date):
    releves = {}
    for ligne in open(releves_path, encoding='utf-8'):
        r = json.loads(ligne)
        if 'erreur' not in r and r.get('id'):
            releves[r['id']] = r
    corr = json.load(open(corr_path, encoding='utf-8'))

    produits = []
    for slug in sorted(corr):
        m = corr[slug]
        if not m.get('confiance') or m['id'] not in releves:
            continue
        d = donnees_de(releves[m['id']])
        if d:
            produits.append((slug, m['url'], m['confiance'], d))
    print('produits relevés', len(produits), file=sys.stderr)

    # Découpe en lots d'environ TAILLE_LOT octets ; dans un lot, une fiche identique n'est écrite qu'une fois.
    lots, courant, taille, vues = [], [], 0, set()
    for slug, url, confiance, d in produits:
        cle = json.dumps(d, sort_keys=True, ensure_ascii=False)
        cout = len(slug) + len(url) + 40 + (0 if cle in vues else len(cle.encode('utf-8')) + 12)
        if courant and taille + cout > TAILLE_LOT:
            lots.append(courant)
            courant, taille, vues = [], 0, set()
            cout = len(slug) + len(url) + 40 + len(cle.encode('utf-8')) + 12
        courant.append((slug, url, confiance, d, cle))
        vues.add(cle)
        taille += cout
    if courant:
        lots.append(courant)

    base = int(horodatage)
    for i, lot in enumerate(lots, 1):
        index, fiches, lignes = {}, [], []
        for slug, url, confiance, d, cle in lot:
            if cle not in index:
                index[cle] = len(fiches) + 1
                fiches.append({'n': index[cle], 'd': d})
            lignes.append({'s': slug, 'u': url, 'n': index[cle], 'c': confiance})
        nom = f'{base + i * 100}_releve_fiche_lot{i:02d}'
        os.makedirs(os.path.join(dossier, nom), exist_ok=True)
        with open(os.path.join(dossier, nom, 'migration.sql'), 'w', encoding='utf-8') as f:
            f.write(sql_du_lot(lignes, fiches, i, len(lots), date, len(lot)))
        print(nom, len(lot), 'produits', len(fiches), 'fiches distinctes', file=sys.stderr)


if __name__ == '__main__':
    main(*sys.argv[1:6])
