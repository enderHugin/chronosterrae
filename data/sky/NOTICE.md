# Catalogo estelar (data/sky/stars.json, constellations.json)

Estos ficheros son datos derivados y llevan su propia licencia, distinta de la del codigo (MIT):

- **HYG Database v4.1** (David Nash, astronexus.com; https://github.com/astronexus/HYG-Database, commit `c7f7f883fe678cc7680169a50ccd7dcc49b060ce`),
  licencia **Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)**. HYG compila Hipparcos (ESA 1997, SP-1200),
  el Yale Bright Star Catalog y el catalogo Gliese. `stars.json` es una adaptacion (seleccion, redondeo, reordenacion):
  se redistribuye bajo **CC BY-SA 4.0**; quien la reutilice debe atribuir a HYG y compartir bajo la misma licencia.
- **d3-celestial 0.7.35** (Olaf Frohn), licencia BSD-3-Clause: figuras de constelaciones y sus nombres en espanol
  (`constellations.json`). Copyright (c) 2015, Olaf Frohn.

Los datos subyacentes (posiciones y movimientos propios) son mediciones astronomicas; la atribucion a ESA/Hipparcos se conserva.

## Precesion de largo plazo (`ltp.json`, `ltp-LICENSE-ERFA.txt`)

`ltp.json` contiene las tablas del modelo de precesion de largo plazo de Vondrak, Capitaine y Wallace (2011, A&A 534, A22;
corrigendum 2012, A&A 541, C1), valido +/-200.000 anos. Se extrajeron **por programa** (`scripts/build-ltp.js`) del texto de
**ERFA** (https://github.com/liberfa/erfa, commit en `ltp.json`), licencia **BSD-3-Clause** (texto en `ltp-LICENSE-ERFA.txt`).
ERFA es una biblioteca derivada, con permiso, de SOFA del IAU; se reconoce ese origen, y ni SOFA ni el IAU avalan este uso.
`sky/ltp.js` es un port propio de las rutinas `eraLtpequ`, `eraLtpecl`, `eraLtp` y `eraLtpb`.
