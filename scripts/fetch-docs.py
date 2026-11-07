#!/usr/bin/env python3
"""fetch-docs.py - Descarga documentos pequenos de origen (etiquetas PDS, figuras con rejilla, paginas) para leer a mano
la proyeccion y el sentido de las longitudes (regla 1: no se supone). Uso: fetch-docs.py LISTA.txt OUT_DIR ('nombre URL' por linea)."""
import sys, os, urllib.request
UA = 'ChronosTerrae-build/1.0 (+https://github.com/enderHugin/chronosterrae)'
lst, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
for line in open(lst):
    p = line.split()
    if len(p) != 2: continue
    try:
        with urllib.request.urlopen(urllib.request.Request(p[1], headers={'User-Agent': UA}), timeout=120) as r: data = r.read(3_000_000)
        open(os.path.join(out, p[0]), 'wb').write(data); print('ok', p[0], len(data))
    except Exception as e: print('FALLO', p[0], e)
