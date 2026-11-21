"""Liste des fiches produit LedPerf à relever, depuis leur plan de site (https://www.ledperf.com/sitemap.php).

Écarte ce que LEDVROOM ne vend pas (règle de l'exploitant) : Osram, Philips, essuie-glaces.
Usage : python3 -I liste_pages.py sitemap.xml a_relever.txt
"""
import re
import sys

EXCLUS = re.compile(r'philips|osram|essuie|balai', re.I)

urls = sorted(set(re.findall(r'<loc>(https://www\.ledperf\.com/[^<]+-p-\d+\.html)</loc>', open(sys.argv[1], encoding='utf-8').read())))
garde = [u for u in urls if not EXCLUS.search(u.rsplit('/', 1)[1])]
open(sys.argv[2], 'w', encoding='utf-8').write('\n'.join(garde) + '\n')
print(len(urls), 'fiches,', len(garde), 'à relever', file=sys.stderr)
