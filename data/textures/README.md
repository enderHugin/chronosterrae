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
