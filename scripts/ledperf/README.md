# Relevé des fiches LedPerf → `ReleveFiche`

Décision de l'exploitant (21 novembre 2026) : les produits du site sont exactement ceux de LedPerf ; quand leur fiche
dit « sans erreur OBD », « plug & play », un temps de montage ou une notice personnalisée, la nôtre le dit aussi, et
le met en avant (badges). Ces scripts relèvent leurs fiches **hors ligne** et produisent des migrations de données ;
rien n'est lu chez eux au moment où un client consulte le site.

L'affichage (badges, atouts, fiche technique, FAQ, flux Google) est décidé par `src/lib/caracteristiques.ts`, avec
nos mots et nos règles : pas de référence d'ampoule sur un pack véhicule, pas d'homologation, pas de marque, pas de
promesse de service qui serait la leur. Ce qui est saisi au back-office l'emporte toujours sur le relevé.

## Refaire le relevé

Python 3 avec `numpy` et `scikit-learn`. Lancer depuis ce dossier, avec `-I`.

1. **Leurs fiches** : `curl -s https://www.ledperf.com/sitemap.php -o sitemap.xml`, puis
   `python3 -I liste_pages.py sitemap.xml a_relever.txt` (écarte Osram, Philips, essuie-glaces).
2. **Relevé poli** (≈ 4 pages/s, cache disque `cache/`, reprend où il s'est arrêté ; ≈ 2 h pour 32 000 fiches) :
   `FILS=8 INTERVALLE=0.24 python3 -I recup.py a_relever.txt`
3. **Lecture des fiches** : `python3 -I extraire.py cache releves.jsonl`
4. **Nos produits** : `curl -s https://ledvroom.com/flux/google-shopping.xml -o flux.xml`, puis
   `python3 -I nos_produits.py flux.xml nos_produits.json`
5. **Rapprochement** : `python3 -I correspondre.py releves.jsonl correspondance.json`
   - même nom (TF-IDF mots + caractères), même véhicule (mots du modèle), années qui se recouvrent, même nature de
     produit (« clignotants » ≠ « clignotants arrière », « + feux stop » ≠ « + feux de jour », LED ≠ effet xénon) ;
   - `exacte` : en plus, le prix concorde (prix LedPerf − 5 %, arrondi à ,90 — le barème du catalogue) ;
   - `forte` : sans prix concordant, un nom presque identique et nettement devant le suivant ;
   - une fiche LedPerf ne sert qu'à un seul de nos produits (sauf fiche commune à plusieurs véhicules).
6. **Migrations** : `python3 -I generer_migrations.py releves.jsonl correspondance.json ../../prisma/migrations <horodatage> <date>`
   — des lots d'environ 1,4 Mo, rejouables (un produit déjà relevé est mis à jour).

`cache/`, `*.jsonl`, `*.json` et `*.xml` sont des fichiers de travail : ils ne sont pas versionnés.
