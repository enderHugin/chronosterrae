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

## Movimiento espacial de las estrellas (`stars3d.json`)

`stars3d.json` es un dato derivado de **HYG Database v4.1** (mismo commit y sha256 que `stars.json`, comprobados por
`scripts/build-stars3d.js`): la velocidad radial (km/s) de las estrellas de `stars.json` que la tienen medida, y 106 estrellas
mas que hoy son mas debiles que V = 6,5 pero llegan a verse a simple vista entre -100.000 y hoy. Se redistribuye bajo
**CC BY-SA 4.0**, igual que `stars.json`. HYG escribe `rv = 0` cuando NO conoce la velocidad radial; aqui un 0 se trata como
«desconocida» y esa estrella queda marcada.

## Sistema solar (`validation-helio.json`, `sky/solar.js`)

`validation-helio.json` es un informe propio (`scripts/validate-helio.js`, workflow `helio-validate.yml`): compara las posiciones
heliocentricas (km) que calcula **astronomy-engine** (MIT) con los vectores de **JPL Horizons** (efemeride DE441; datos del
JPL/Caltech, de la NASA, sin restricciones de uso para este fin), en 16 epocas de -2000 a 3000. No contiene datos de Horizons
salvo las cifras de error. Los radios de `sky/solar.js` son valores publicados: ficha de planetas de la NASA (NSSDCA,
https://nssdc.gsfc.nasa.gov/planetary/factsheet/, actualizada el 18-03-2025) y el radio solar nominal de la Resolucion B3 de la IAU 2015.
