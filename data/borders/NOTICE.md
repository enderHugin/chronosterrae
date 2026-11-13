# Fronteras vigentes (Natural Earth)

`ne-10m-countries.json` deriva de **Natural Earth** (`ne_10m_admin_0_countries`), publicado en el
repositorio `nvkelso/natural-earth-vector`. Natural Earth es de **dominio público**
(<https://www.naturalearthdata.com/about/terms-of-use/>); aun así se atribuye por transparencia.

- Origen exacto, commit y `sha256` del fichero original: `manifest.json`.
- Transformaciones: solo recorte de propiedades y redondeo de coordenadas a 4 decimales. **No se ha editado ninguna geometría.**
- Resolución medida: mediana de unos 1,7 km entre vértices. No es precisión catastral.
- Reconstruir: `node scripts/build-borders.js --src <fichero> --commit <sha> --out data/borders`.
- Se usa solo para el presente (desde 2016; 2016–2019 con aviso de que las diferencias menores no se han comprobado una a una). Para épocas anteriores la web sigue con `historical-basemaps` (GPL, cargado en ejecución).

# Máscara de tierra actual (Natural Earth)

`ne-land-mask.json` deriva de **Natural Earth** `ne_10m_land` y `ne_10m_minor_islands` (mismo repositorio y commit que arriba; `sha256`
de cada fichero en su `meta`). **Dominio público.** Solo dice dónde hay tierra: no se dibuja ni dice de quién es nada. Sirve para recortar
el color político contra la costa real cuando se ve la Tierra natural (imagen de NASA, costas de hoy; épocas de los últimos ~6000 años).

- Transformaciones: simplificación Douglas-Peucker por anillo (0,6 km), coordenadas a 3 decimales (~110 m) y sin anillos de menos de 0,5 km².
- Reconstruir: `node scripts/build-land-mask.js --src ne_10m_land.geojson --src ne_10m_minor_islands.geojson --commit <sha> --out data/borders`.
