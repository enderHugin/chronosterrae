#!/usr/bin/env python3
"""build-rings.py - Perfil radial de PROFUNDIDAD OPTICA NORMAL de los anillos de Saturno a partir de las ocultaciones solares de Cassini UVIS.

Fuente: Becker, T. M. y Jarmak, S. G. (2023), "Saturn Ring System Solar Occultations Observed by Cassini UVIS", PDS Ring-Moon Systems Node,
DOI 10.17189/1523014 (datos PDS4, tablas .tab). Columnas usadas (segun la etiqueta XML): 7 "Ring Radius Mid Integration" (km),
22 "Normal Optical Depth", 23 "Note Flag". Se descartan las filas con bandera distinta de 0 y las sin valor.
Metodo: por cada ocultacion se promedian las filas dentro de cada intervalo radial; entre ocultaciones se toma la MEDIANA. Un intervalo
con menos de MIN_PROFILES ocultaciones queda sin dato (null): no se rellena. Las profundidades muy altas (anillo B) son cotas inferiores:
el instrumento se satura (la senal cae al ruido). Es una medida de cuanta luz bloquea el anillo (transmision = exp(-tau/mu)), no su color.
Uso: python3 scripts/build-rings.py OUT_DIR
"""
import csv, hashlib, io, json, os, re, statistics, sys, urllib.request
BASE = 'https://pds-rings.seti.org/pds4/bundles/cassini_uvis_solarocc_beckerjarmak2023/cassini_uvis_solarocc_beckerjarmak2023_v1.0/data/'
UA = 'ChronosTerrae-build/1.0 (+https://github.com/enderHugin/chronosterrae)'
R0, R1, STEP = 66000.0, 142000.0, 25.0        # km desde el centro de Saturno
MIN_PROFILES = 3
COL_R, COL_TAU, COL_FLAG = 6, 21, 22           # indices 0-based de las columnas 7, 22 y 23

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=300) as r: return r.read()

def main(out):
    os.makedirs(out, exist_ok=True)
    idx = get(BASE).decode('utf-8', 'replace')
    names = sorted(set(re.findall(r'href="([^"?#/]+\.tab)"', idx)))
    n = int(round((R1 - R0) / STEP))
    per = [[[] for _ in range(n)] for _ in names]
    meta = []
    for k, name in enumerate(names):
        txt = get(BASE + name).decode('utf-8', 'replace')
        rows = kept = 0; flags = {}; rmin, rmax = 1e12, 0
        for line in txt.splitlines():
            p = [x.strip() for x in line.split(',')]
            if len(p) <= COL_FLAG: continue
            try: r = float(p[COL_R]); tau = float(p[COL_TAU]); fl = int(float(p[COL_FLAG]))
            except ValueError: continue
            rows += 1; flags[fl] = flags.get(fl, 0) + 1
            if fl != 0 or not (tau == tau) or tau < -50 or tau > 50: continue
            b = int((r - R0) // STEP)
            if 0 <= b < n: per[k][b].append(tau); kept += 1; rmin = min(rmin, r); rmax = max(rmax, r)
        meta.append(dict(file=name, rows=rows, kept=kept, flags=flags, radiusKm=[round(rmin, 1), round(rmax, 1)] if kept else None))
        print(name, rows, kept, flags, flush=True)
    tau_out, cnt_out = [], []
    for b in range(n):
        vals = [statistics.fmean(per[k][b]) for k in range(len(names)) if per[k][b]]
        cnt_out.append(len(vals))
        tau_out.append(round(max(0.0, statistics.median(vals)), 4) if len(vals) >= MIN_PROFILES else None)
    covered = [i for i, v in enumerate(tau_out) if v is not None]
    man = dict(id='saturn-rings-tau', source='Becker & Jarmak 2023, Cassini UVIS solar occultations (PDS4), DOI 10.17189/1523014', sourceUrl=BASE,
               credit='NASA/JPL-Caltech/University of Colorado LASP/SSI; PDS Ring-Moon Systems Node (Jarmak, Becker, Colwell)',
               columns=dict(radius='7 Ring Radius Mid Integration (km)', tau='22 Normal Optical Depth', flag='23 Note Flag (se usan solo las filas con 0)'),
               method='media por intervalo dentro de cada ocultacion; mediana entre ocultaciones; minimo %d ocultaciones por intervalo, si no, null' % MIN_PROFILES,
               limits='tau alto (anillo B) es cota inferior por saturacion del instrumento; no es una imagen ni un color',
               r0Km=R0, stepKm=STEP, n=n, profiles=len(names), covered=[round(R0 + covered[0] * STEP), round(R0 + (covered[-1] + 1) * STEP)] if covered else None,
               tau=tau_out, count=cnt_out, files=meta)
    body = json.dumps(man, ensure_ascii=False, separators=(',', ':'))
    open(os.path.join(out, 'saturn-rings-tau.json'), 'w', encoding='utf-8').write(body)
    print('intervalos con dato:', len(covered), 'de', n, 'cobertura km', man['covered'], 'bytes', len(body))

if __name__ == '__main__':
    main(sys.argv[1])
