"""Récupération polie des pages LedPerf, avec cache disque (gzip)."""
import gzip, os, re, sys, time, random, threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = 'Mozilla/5.0 (compatible; LEDVROOM-catalogue/1.0; +https://ledvroom.com)'
CACHE = os.path.join(os.path.dirname(__file__), 'cache')
os.makedirs(CACHE, exist_ok=True)
_verrou = threading.Lock()
_dernier = [0.0]
INTERVALLE = float(os.environ.get('INTERVALLE', '0.25'))  # secondes entre deux départs, tous fils confondus


def cle(url: str) -> str:
    m = re.search(r'-p-(\d+)\.html', url)
    if m:
        return 'p' + m.group(1)
    return re.sub(r'[^a-zA-Z0-9]+', '_', url.split('ledperf.com/')[-1])[:150]


def chemin(url: str) -> str:
    return os.path.join(CACHE, cle(url) + '.html.gz')


def lire_cache(url: str):
    c = chemin(url)
    if os.path.exists(c):
        with gzip.open(c, 'rt', encoding='utf-8', errors='replace') as f:
            return f.read()
    return None


def recuperer(url: str, essais: int = 4):
    h = lire_cache(url)
    if h is not None:
        return url, 200, h
    for n in range(essais):
        with _verrou:
            attente = _dernier[0] + INTERVALLE - time.time()
            if attente > 0:
                time.sleep(attente)
            _dernier[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip', 'Accept-Language': 'fr-FR,fr;q=0.9'})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    data = gzip.decompress(data)
                h = data.decode('utf-8', errors='replace')
                with gzip.open(chemin(url), 'wt', encoding='utf-8') as f:
                    f.write(h)
                return url, r.status, h
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return url, e.code, None
            time.sleep(3 * (n + 1))
        except Exception:
            time.sleep(3 * (n + 1))
    return url, 0, None


def tout(urls, fils=int(os.environ.get("FILS", "3"))):
    with ThreadPoolExecutor(fils) as ex:
        for res in ex.map(recuperer, urls):
            yield res


if __name__ == '__main__':
    urls = [l.strip() for l in open(sys.argv[1]) if l.strip()]
    ok = 0
    for i, (u, s, h) in enumerate(tout(urls)):
        ok += s == 200
        if i % 50 == 0:
            print(i, s, u, flush=True)
    print('fini', ok, '/', len(urls))
