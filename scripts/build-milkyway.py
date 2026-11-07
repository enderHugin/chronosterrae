#!/usr/bin/env python3
"""build-milkyway.py - Fondo de la Via Lactea a partir del mapa de NASA SVS "Deep Star Maps 2020" (capa milkyway_2020, ICRF/J2000).

Procedencia: https://svs.gsfc.nasa.gov/4851/ (Hipparcos-2, Tycho-2, Gaia DR2). Credito pedido por la pagina:
"NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC". La pagina no declara licencia propia
y remite a las pautas de reproduccion de la NASA.
Cartografia (segun la pagina): plate carree, ascension recta y declinacion geocentricas ICRF/J2000, centrado en 0 h de AR, la AR
CRECE HACIA LA IZQUIERDA. Los datos de origen son lineales en half-float: aqui se pasan a 8 bits con UNA exposicion fija
(percentil 99,5 de la luminancia -> 1,0) y gamma sRGB; los parametros y las estadisticas se guardan en el manifiesto.
Uso: python3 scripts/build-milkyway.py OUT_DIR
"""
import hashlib, json, os, sys, urllib.request
os.environ['OPENCV_IO_ENABLE_OPENEXR'] = '1'
import cv2, numpy as np

BASE = 'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/'
FILE = 'milkyway_2020_4k.exr'
UA = 'ChronosTerrae-build/1.0 (+https://github.com/enderHugin/chronosterrae)'

def main(out):
    os.makedirs(out, exist_ok=True)
    src = os.path.join(out, FILE)
    req = urllib.request.Request(BASE + FILE, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=600) as r, open(src, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b)
    h = hashlib.sha256(open(src, 'rb').read()).hexdigest()
    img = cv2.imread(src, cv2.IMREAD_UNCHANGED)             # BGR(A) float
    if img is None: raise SystemExit('no se pudo leer el EXR')
    img = img[:, :, :3].astype(np.float32)[:, :, ::-1]      # RGB
    lum = 0.2126 * img[:, :, 0] + 0.7152 * img[:, :, 1] + 0.0722 * img[:, :, 2]
    stats = dict(shape=list(img.shape), min=float(img.min()), max=float(img.max()), mean=float(img.mean()),
                 p50=float(np.percentile(lum, 50)), p99=float(np.percentile(lum, 99)), p995=float(np.percentile(lum, 99.5)), p999=float(np.percentile(lum, 99.9)))
    ref = max(stats['p995'], 1e-9)
    lin = np.clip(img / ref, 0, 1)
    srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    out8 = (np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8)
    dst = os.path.join(out, 'milkyway_icrs_4k.jpg')
    cv2.imwrite(dst, out8[:, :, ::-1], [cv2.IMWRITE_JPEG_QUALITY, 88])
    os.remove(src)
    man = dict(id='milkyway', sourcePage='https://svs.gsfc.nasa.gov/4851/', sourceUrl=BASE + FILE, sourceSha256=h,
               credit='NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC',
               projection='plate carree, AR/Dec ICRF/J2000 geocentricas; centrado en AR 0 h; la AR crece hacia la izquierda (segun la pagina de origen)',
               toneMap=dict(exposureRef='percentil 99,5 de la luminancia lineal', ref=ref, transfer='sRGB'), stats=stats,
               output=dict(file='milkyway_icrs_4k.jpg', width=int(out8.shape[1]), height=int(out8.shape[0]), bytes=os.path.getsize(dst),
                           sha256=hashlib.sha256(open(dst, 'rb').read()).hexdigest()))
    json.dump(man, open(os.path.join(out, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(man, ensure_ascii=False)[:1500])

if __name__ == '__main__':
    main(sys.argv[1])
