# Fronteras vigentes (Natural Earth)

`ne-10m-countries.json` deriva de **Natural Earth** (`ne_10m_admin_0_countries`), publicado en el
repositorio `nvkelso/natural-earth-vector`. Natural Earth es de **dominio público**
(<https://www.naturalearthdata.com/about/terms-of-use/>); aun así se atribuye por transparencia.

- Origen exacto, commit y `sha256` del fichero original: `manifest.json`.
- Transformaciones: solo recorte de propiedades y redondeo de coordenadas a 4 decimales. **No se ha editado ninguna geometría.**
- Resolución medida: mediana de unos 1,7 km entre vértices. No es precisión catastral.
- Reconstruir: `node scripts/build-borders.js --src <fichero> --commit <sha> --out data/borders`.
- Se usa solo para el presente (desde 2020). Para épocas anteriores la web sigue con `historical-basemaps` (GPL, cargado en ejecución).
