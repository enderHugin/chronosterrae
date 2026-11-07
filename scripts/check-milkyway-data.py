#!/usr/bin/env python3
"""check-milkyway-data.py - La textura REAL de la Via Lactea (data/textures/milkyway_icrs_4k.jpg) esta en el marco que dice el manifiesto.

La geometria del muestreo se prueba en Node con texturas sinteticas (scripts/check-milkyway.js); aqui se comprueba la imagen descargada:
  1. Las Nubes de Magallanes (LMC y SMC) aparecen donde estan: su centroide en la textura cae a menos de 1,2 grados de la posicion de referencia
     (un espejo de AR, un intercambio de ejes o un desplazamiento de decenas de grados no pasan esta prueba).
  2. El plano de la Via Lactea esta centrado en latitud galactica b = 0 (mediana del centroide por longitud |b| < 1,5 grados, rms < 2),
     usando la definicion IAU/Hipparcos del sistema galactico (polo norte galactico AR 192,85948 Dec +27,12825; longitud del polo celeste 122,93192).
  3. La imagen tiene las dimensiones declaradas (4096 x 2048).
Posiciones de referencia (centros opticos aproximados, SIMBAD/NED): LMC 80,894 / -69,756; SMC 13,187 / -72,829 (AR, Dec J2000, grados).
Requiere pillow y numpy. Sale con 1 si falla algo.
"""
import os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
im = np.asarray(Image.open(os.path.join(ROOT, 'data', 'textures', 'milkyway_icrs_4k.jpg')).convert('L'), dtype=float)
H, W = im.shape
fails = 0
def check(name, ok, detail=''):
    global fails
    print(('  ok  ' if ok else '  XX  ') + name + (' ' + detail if detail else ''))
    if not ok: fails += 1

check('dimensiones 4096 x 2048', (W, H) == (4096, 2048))
d2r = np.pi / 180
jj, ii = np.mgrid[0:H, 0:W]
ra_p = (0.5 - (ii + .5) / W) * 360; de_p = (0.5 - (jj + .5) / H) * 180        # AR 0 h en el centro, creciendo hacia la izquierda
X = np.cos(de_p * d2r) * np.cos(ra_p * d2r); Y = np.cos(de_p * d2r) * np.sin(ra_p * d2r); Z = np.sin(de_p * d2r)

def centroid(ra, dec, rad):
    cosd = np.sin(de_p * d2r) * np.sin(dec * d2r) + np.cos(de_p * d2r) * np.cos(dec * d2r) * np.cos((ra_p - ra) * d2r)
    sep = np.degrees(np.arccos(np.clip(cosd, -1, 1)))
    m = sep < rad; bg = np.percentile(im[(sep >= rad) & (sep < rad * 1.6)], 30)
    w = np.clip(im - bg, 0, None) * m
    v = np.array([(w * X).sum(), (w * Y).sum(), (w * Z).sum()]); v /= np.linalg.norm(v)
    return np.degrees(np.arctan2(v[1], v[0])) % 360, np.degrees(np.arcsin(v[2]))

def sep_deg(a, b):
    va = [np.cos(a[1] * d2r) * np.cos(a[0] * d2r), np.cos(a[1] * d2r) * np.sin(a[0] * d2r), np.sin(a[1] * d2r)]
    vb = [np.cos(b[1] * d2r) * np.cos(b[0] * d2r), np.cos(b[1] * d2r) * np.sin(b[0] * d2r), np.sin(b[1] * d2r)]
    return float(np.degrees(np.arccos(np.clip(np.dot(va, vb), -1, 1))))

def sepmap(ra, dec):
    cosd = np.sin(de_p * d2r) * np.sin(dec * d2r) + np.cos(de_p * d2r) * np.cos(dec * d2r) * np.cos((ra_p - ra) * d2r)
    return np.degrees(np.arccos(np.clip(cosd, -1, 1)))

for name, ra, dec, rad in [('LMC', 80.894, -69.756, 8), ('SMC', 13.187, -72.829, 4.5)]:
    sm = sepmap(ra, dec)
    inner = float(im[sm < rad * 0.4].mean()); ring = float(im[(sm > rad * 1.2) & (sm < rad * 1.8)].mean())
    # 1) HAY senal: sin ella el centroide de un disco de busqueda cae en su propio centro (la posicion de referencia) y la prueba pasaria en vacio
    check(name + ': la nube se ve (brillo interior > entorno + 40 niveles de 255)', inner - ring > 40, '(interior %.0f, entorno %.0f)' % (inner, ring))
    # 2) esta donde debe
    c = centroid(ra, dec, rad); s = sep_deg(c, (ra, dec))
    check(name + ': el centroide en la textura cae a < 1,2 grados de la posicion de referencia', s < 1.2, '(centroide %.2f, %.2f; separacion %.2f grados)' % (c[0], c[1], s))

ra0, de0, lncp = np.radians(192.85948), np.radians(27.12825), np.radians(122.93192)
ngp = np.array([np.cos(de0) * np.cos(ra0), np.cos(de0) * np.sin(ra0), np.sin(de0)])
ep = np.array([0, 0, 1.0]) - ngp[2] * ngp; ep /= np.linalg.norm(ep); eq = np.cross(ngp, ep)
def gal2eq(l, b):
    inplane = np.cos(l - lncp)[..., None] * ep + np.sin(l - lncp)[..., None] * eq
    return np.cos(b)[..., None] * inplane + np.sin(b)[..., None] * ngp
v0 = gal2eq(np.array([0.0]), np.array([0.0]))[0]
check('definicion galactica: l = 0, b = 0 es AR 266,405 / Dec -28,936 (centro galactico estandar)', abs((np.degrees(np.arctan2(v0[1], v0[0])) % 360) - 266.405) < 0.01 and abs(np.degrees(np.arcsin(v0[2])) + 28.936) < 0.01)
bs = np.radians(np.arange(-12, 12.01, 0.25)); cents = []
for ldeg in range(0, 360, 5):
    v = gal2eq(np.full_like(bs, np.radians(ldeg)), bs)
    ra = np.arctan2(v[..., 1], v[..., 0]); dec = np.arcsin(np.clip(v[..., 2], -1, 1))
    x = np.clip(((0.5 - ra / (2 * np.pi)) * W).astype(int) % W, 0, W - 1); y = np.clip(((0.5 - dec / np.pi) * H).astype(int), 0, H - 1)
    prof = im[y, x]; w = np.clip(prof - prof.min(), 0, None); cents.append(np.degrees((w * bs).sum() / w.sum()))
# la banda es MUCHO mas brillante que el cielo galactico alto (sin esto un centroide sobre ruido pasaria en vacio)
pj, pi_ = np.mgrid[0:H, 0:W]
lat_g = np.degrees(np.arcsin(np.clip(X * ngp[0] + Y * ngp[1] + Z * ngp[2], -1, 1)))
band = float(im[np.abs(lat_g) < 3].mean()); high = float(im[(np.abs(lat_g) > 40)].mean())
check('banda galactica (|b| < 3) al menos 3 veces mas brillante que el cielo alto (|b| > 40)', band > 3 * high, '(banda %.0f, alto %.0f)' % (band, high))
c = np.array(cents); med = float(np.median(c)); rms = float(np.sqrt(np.mean(c ** 2)))
check('plano de la Via Lactea: centroide de brillo en b ~ 0 (mediana |b| < 1,5 y rms < 2 grados)', abs(med) < 1.5 and rms < 2, '(mediana %.2f, rms %.2f)' % (med, rms))
print('\nFALLAN %d' % fails if fails else '\nOK')
sys.exit(1 if fails else 0)
