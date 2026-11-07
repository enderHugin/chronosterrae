# Texturas y datos de cuerpos del sistema solar

Todo sale de productos oficiales de NASA y USGS (dominio público, con el crédito indicado en `manifest.json`), reducidos en GitHub Actions con
`scripts/build-textures.py`, `scripts/build-milkyway.py` y `scripts/build-rings.py`. Nada está dibujado a mano. `manifest.json` guarda, por archivo:
URL y página de origen, dimensiones de origen, proyección y sentido de las longitudes según la etiqueta PDS, método de reducción y huella sha256
(`npm run check:textures` las comprueba).

Lo que se ve es **la superficie o el techo de nubes actual** de cada cuerpo (imagen de misión), no una reconstrucción. Límites que la web debe decir:

- Júpiter: techo de nubes de diciembre de 2000. Las bandas son estables; las manchas y óvalos no. No se afirma la posición de ningún detalle.
- Marte: color sintetizado de Viking (producto cartográfico). Luna: color de LROC con relleno polar de albedo de LOLA.
- Venus: la única fuente verificada es radar, no luz visible; no se usa. Saturno, Urano y Neptuno: sin mapa verificado, se dibujan en color medio.
- Anillos de Saturno: perfil de profundidad óptica normal medido por Cassini UVIS (Becker y Jarmak 2023, DOI 10.17189/1523014), mediana de 41
  ocultaciones solares. Dice cuánta luz bloquea el anillo, no su color; en el anillo B es cota inferior (saturación del instrumento).
- Vía Láctea: NASA SVS «Deep Star Maps 2020» (Hipparcos-2, Tycho-2, Gaia DR2), capa de fondo difuso, con punto negro y exposición fijos y documentados.
  Crédito: NASA/Goddard Space Flight Center Scientific Visualization Studio; Gaia DR2: ESA/Gaia/DPAC.

Convención de las texturas de cuerpos: columna `j` de 2048 → longitud ESTE = 360·(j+½)/2048 − 180; fila `i` de 1024 → latitud planetocéntrica = 90 − 180·(i+½)/1024.
El fondo de la Vía Láctea es plate carrée en AR/Dec ICRF/J2000, centrado en 0 h con la AR creciendo hacia la izquierda.

## Cómo se usa la Vía Láctea en pantalla

`sky/milkyway.js` (módulo puro, con pruebas en `scripts/check-milkyway.js`) calcula, para cada celda de 4 px de la pantalla, la dirección J2000 que ve
esa celda y muestrea la textura (bilineal, reducida a 2048 × 1024 al cargar: 10,5′ por píxel, 8 MB en memoria). Se suma luz (`lighter`) bajo las estrellas
del catálogo. La textura se hizo para verse (mediana 59/255); en pantalla se aplica gamma 2,2 y ganancia 0,8 (mediana ~8) para un cielo oscuro que conserve el
contraste de la banda. Las inversas de cámara son `makeProjector().unproject`, `j2000FromModel` y `j2000FromModelCio` (`sky/space.js`) y `camera.ray` /
`eqFromEcl` (`sky/solar.js`).

**Verificación del marco con los datos reales** (`scripts/check-milkyway-data.py`, medido el 2026-11-07, en CI): el centroide de la LMC cae a 0,57° y el de la SMC
a 0,39° de su posición de referencia; la banda es 5,8 veces más brillante que el cielo alto; el centroide de brillo en latitud galáctica por longitud tiene
mediana −0,72° y rms 1,09° (el Sol está sobre el plano y el disco tiene alabeo). Rechaza el espejo en AR, el espejo en Dec, el giro de 180° y un desplazamiento
de 90° en AR. **Límite:** garantiza el marco a escala de ~1°, no de un píxel.

Qué NO hay: M31 y M33 no aparecen en la textura (Gaia no las resuelve como campo estelar; comprobado: su brillo no se distingue del entorno). Dibujarlas exige
posición, tamaño y ángulo de posición verificados en una fuente primaria (SIMBAD/NED) y se haría como símbolo esquemático rotulado como tal.

Fuentes de la web de la NASA que solo se alcanzan desde Actions (la sandbox de los agentes no llega): los resultados se generan con los workflows
`textures-probe.yml`, `textures-build.yml`, `textures-docs.yml`, `milkyway-build.yml` y `rings-build.yml` y se **confirman en `data/textures/`** (ramas de resultados
`textures-probe`, `textures-build`, `textures-docs`, `milkyway-build` y `rings-build`).
