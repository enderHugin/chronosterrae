#!/usr/bin/env python3
"""Genera la referencia de ERFA (C compilado, via pyerfa) para comparar con sky/ltp.js. NO esta aun en `npm test`:
hasta que exista scripts/ref/ltp-erfa-reference.json el cotejo directo contra ERFA no esta hecho.

    pip install pyerfa      (registro oficial de pip; trae ERFA compilado)
    python3 -I scripts/ref/ltp_erfa_ref.py

Salida: matrices eraLtp/eraLtpb, polos eraLtpequ/eraLtpecl y eraEra00 en epocas de +/-200.000 anos, con la version de ERFA/pyerfa.
"""
import json, os, erfa
import numpy as np
epochs = [2000 + k for k in (-200000, -150000, -100000, -50000, -20000, -12000, -5000, -2000, -500, 0, 100, 500, 2000, 12000, 50000, 100000, 200000)]
out = dict(pyerfa=erfa.__version__, erfa=getattr(erfa, 'erfa_version', None) or getattr(getattr(erfa, 'version', None), 'erfa_version', None), epochs=[])
for e in epochs:
    out['epochs'].append(dict(epj=e, ltp=erfa.ltp(e).tolist(), ltpb=erfa.ltpb(e).tolist(), equ=erfa.ltpequ(e).tolist(), ecl=erfa.ltpecl(e).tolist()))
out['era'] = [dict(ut1_days=d, era=float(erfa.era00(2451545.0, 0.0 + d))) for d in (-3.65e7, -1e6, -1000.5, 0.0, 0.25, 12345.678, 1e5)]
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ltp-erfa-reference.json'), 'w') as fh:
    json.dump(out, fh, separators=(',', ':'))
print('referencia ERFA escrita:', out['pyerfa'], out['erfa'])
