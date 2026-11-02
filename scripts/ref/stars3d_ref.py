#!/usr/bin/env python3
"""Implementacion INDEPENDIENTE (numpy/scipy) del movimiento espacial de estrellas de sky/stars3d.js.

Se escribio sin mirar el codigo JS: otra base vectorial (este/norte por productos vectoriales), constantes derivadas
de las definiciones (ua, pc, ano juliano, c) y el tiempo de luz resuelto con un buscador de raices (brentq), no por
iteracion de punto fijo. Genera scripts/ref/stars3d-reference.json, que check-stars3d.js compara con el modulo JS.

    python3 scripts/ref/stars3d_ref.py        (necesita numpy y scipy)
"""
import json, hashlib, math, os, random
import numpy as np
from scipy.optimize import brentq

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
AU_KM = 149597870.700                       # definicion IAU 2012
PC_KM = 648000.0 / math.pi * AU_KM
YR_S = 365.25 * 86400.0
C_KMS = 299792.458
MAS_RAD = math.pi / (180 * 3600 * 1000)
C_PC_YR = C_KMS * YR_S / PC_KM

def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()

def load():
    st = json.load(open(os.path.join(ROOT, 'data/sky/stars.json')))
    s3 = json.load(open(os.path.join(ROOT, 'data/sky/stars3d.json')))
    rows = []
    for s in st['stars']:
        rv = s3['rv'].get(str(s[0]))
        rows.append(dict(hip=s[0], ra=s[1], dec=s[2], pmra=s[3], pmde=s[4], plx=s[5], vmag=s[6], rv=rv))
    for s in s3['extra']:
        rows.append(dict(hip=s[0], ra=s[1], dec=s[2], pmra=s[3], pmde=s[4], plx=s[5], vmag=s[6], rv=s[9]))
    return rows

def observe(r, t):
    """Direccion unitaria y magnitud vistas en t (anos desde J2000.0)."""
    a = math.radians(r['ra']); d = math.radians(r['dec'])
    rhat = np.array([math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)])
    east = np.cross([0, 0, 1.0], rhat); east /= np.linalg.norm(east)
    north = np.cross(rhat, east)
    if r['plx'] <= 0:
        mu = (r['pmra'] * east + r['pmde'] * north) * MAS_RAD
        v = rhat + mu * t
        return v / np.linalg.norm(v), r['vmag']
    d0 = 1000.0 / r['plx']
    vr = (r['rv'] if r['rv'] is not None else 0.0) * YR_S / PC_KM       # pc/ano
    vel = vr * rhat + d0 * MAS_RAD * (r['pmra'] * east + r['pmde'] * north)
    P0 = d0 * rhat; te0 = -d0 / C_PC_YR
    P = lambda te: P0 + vel * (te - te0)
    f = lambda te: te + np.linalg.norm(P(te)) / C_PC_YR - t
    lo = t - 3 * d0 / C_PC_YR - 1000; hi = t + 1000
    te = brentq(f, lo, hi, xtol=1e-14, rtol=1e-15, maxiter=500)
    p = P(te); D = np.linalg.norm(p)
    return p / D, r['vmag'] + 5 * math.log10(D / d0)

def main():
    rows = load()
    rng = random.Random(20261102)
    times = [-100000, -50000, -12000, -4000, -2000, 0, 2000]
    # muestra: aleatoria + los casos duros (movimiento propio grande, cerca, extra, sin paralaje, sin rv)
    idx = set(rng.sample(range(len(rows)), 300))
    hard = sorted(range(len(rows)), key=lambda i: -math.hypot(rows[i]['pmra'], rows[i]['pmde']))[:40]
    near = sorted([i for i in range(len(rows)) if rows[i]['plx'] > 0], key=lambda i: -rows[i]['plx'])[:40]
    idx |= set(hard) | set(near) | set(range(len(rows) - 106, len(rows)))
    idx |= {i for i in range(len(rows)) if rows[i]['plx'] <= 0 and len(idx) < 700 and rng.random() < 0.15}
    idx |= {i for i in range(len(rows)) if rows[i]['rv'] is None and rng.random() < 0.1}
    out = []
    for i in sorted(idx):
        r = rows[i]
        res = []
        for t in times:
            u, m = observe(r, t)
            res.append([t, u.tolist(), m])
        out.append(dict(index=i, hip=r['hip'], obs=res))
    ref = dict(
        generator='scripts/ref/stars3d_ref.py (numpy %s)' % np.__version__,
        stars_sha256=sha(os.path.join(ROOT, 'data/sky/stars.json')),
        stars3d_sha256=sha(os.path.join(ROOT, 'data/sky/stars3d.json')),
        times=times, n_stars=len(out), stars=out)
    with open(os.path.join(ROOT, 'scripts/ref/stars3d-reference.json'), 'w') as fh:
        json.dump(ref, fh, separators=(',', ':'))
    print('referencia: %d estrellas x %d epocas' % (len(out), len(times)))

main()
