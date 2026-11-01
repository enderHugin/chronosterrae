# ChronosTerrae 🌍⏳

**[Leer en inglés ↓](#english)**

Cartografía de tiempo profundo: un globo por el que viajar de hoy a hace 1.000 millones de
años, con costas paleogeográficas reales y fronteras históricas, donde cada dato dice de dónde
sale y cuánto se puede fiar de él.

**Demo:** <https://enderhugin.github.io/chronosterrae/> · **Visión completa:** [`docs/VISION.md`](docs/VISION.md)

## Qué funciona hoy

- **Globo** (MapLibre GL) con un deslizador de tiempo logarítmico de 2026 a 1.000 Ma y
  entrada libre de fechas: `1789`, `44 a.C.`, `12 ka`, `250 Ma`.
- **Costas paleogeográficas reales de 0 a 535 Ma** (PaleoMAP PaleoCoastlines, Kocsis y Scotese,
  CC BY 4.0), con el margen continental. Se sirven desde este repositorio
  (`data/paleocoastlines/`), no de un servicio externo.
- **Fronteras y pueblos históricos de −123000 a 2010** ([historical-basemaps](https://github.com/aourednik/historical-basemaps),
  GPL-3.0, cargadas en tiempo de ejecución con atribución). Búsqueda por nombre con salto a su época.
- **Tipo de evidencia en cada capa** (medición, documento, artefacto, modelo, reconstrucción,
  especulación), siempre visible.
- **Datos recientes** de un recolector diario (artículos más vistos de Wikipedia con coordenadas
  en Wikidata), mostrados solo en el presente.
- **Cielo** (botón «Cielo»): Sol, Luna con su fase, y Mercurio a Neptuno para cualquier fecha entre
  el 2001 a. C. y hoy, hora solar local y lugar (el centro del mapa o el que escribas), con calendario
  juliano hasta el 4-10-1582 y gregoriano después, refracción y crepúsculo. El cálculo está en
  `sky/sky.js` y se contrasta con JPL Horizons en Actions: **el error medido se muestra en la propia
  web** (segundos de arco hoy; unos 15′ para la Luna hacia el año 0 y ~1,2° hacia el 2000 a. C.).
- ES/EN, tema claro/oscuro; idioma, tema, instante y cámara se recuerdan en una cookie propia.

## Límites conocidos (dichos sin adornos)

- De 535 a 1.000 Ma solo hay **contornos actuales movidos como bloques rígidos** (GPlates,
  modelo Merdith 2021). La web lo rotula; no son las costas reales de esa época.
- Las fronteras históricas son un mapa compilado y en elaboración: contrástalas antes de citarlas.
- **Cielo sin estrellas todavía**: falta decidir la fuente del catálogo (Hipparcos es de ESA con
  licencia CC BY-NC 3.0 IGO, solo no comercial). Hasta entonces el panel avisa y dibuja Sol, Luna y planetas.
- La precisión del cielo se degrada hacia el pasado (efemérides analíticas truncadas y ΔT, la
  rotación de la Tierra, que es una estimación antes de ~1600): la web muestra el error medido, no una promesa.
- Sin personas, obras, fauna o flora todavía. Están en la hoja de ruta.

## Hoja de ruta

Cielo según fecha y lugar · personas, obras e inventos · fauna y flora (actual y fósil) ·
directo (terremotos, noticias) · vida cotidiana por época con tipo de evidencia · contribuciones
científicas y de agentes de IA con verificación automática de fuentes · VR/AR. Detalle y estado
real de cada fuente en [`docs/VISION.md`](docs/VISION.md).

## Datos y procedencia

Todo registro nuevo debe cumplir [`schemas/record.schema.json`](schemas/record.schema.json):
fecha con incertidumbre y calendario, escala, fuente verificable (DOI, Wikidata, URL), tipo de
evidencia y nivel de revisión. Sin fuente no hay dato. Un dato generado por IA no pasa de
`community` sin revisión humana.

## Privacidad

La web guarda **una sola cookie propia**, `ct_prefs`, con tu idioma, el tema claro/oscuro, el
instante que estabas viendo y la posición de la cámara, para que al volver todo siga como lo
dejaste. Dura un año, no sale de tu navegador (no se envía a ningún servidor nuestro) y no se usa
para seguimiento ni analítica. Si la borras, la web arranca con sus valores por defecto.

## Desarrollo

```bash
npm ci
npm test        # regresiones del cliente y del recolector + validación del esquema
```

- `scripts/probe.js` comprueba desde GitHub que las fuentes externas responden y permiten uso desde
  el navegador (resultado en la rama `probe-results`).
- `scripts/build-paleocoastlines.js` reconstruye `data/paleocoastlines/` desde Zenodo, verificando el md5.

## Apoyar el proyecto

☕ [Ko-fi](https://ko-fi.com/jaimeluisolguinmesina): las aportaciones financian el almacenamiento
del archivo propio y las horas de desarrollo.

## Licencias

Código: MIT. Datos: cada fuente conserva su licencia y se atribuye en la propia web
(PaleoMAP: CC BY 4.0; historical-basemaps: GPL-3.0).

---

<a id="english"></a>

# ChronosTerrae (English)

Deep-time cartography: a globe you can travel from today back 1,000 million years, with real
palaeogeographic coastlines and historical borders, where every datum states where it comes from
and how far it can be trusted.

**Demo:** <https://enderhugin.github.io/chronosterrae/> · **Full vision:** [`docs/VISION.md`](docs/VISION.md)

**Works today:** globe with a logarithmic time slider (2026 → 1,000 Ma) and free date
entry; real palaeocoastlines for 0–535 Ma (PaleoMAP, Kocsis & Scotese, CC BY 4.0) served from this
repository; historical borders from 123,000 BC to 2010; an evidence-type label on every layer;
recent data from a daily harvester, shown only at the present day. Language, theme, time and camera are remembered in a single first-party cookie (`ct_prefs`, one year, no tracking).

**Known limits:** from 535 to 1,000 Ma only rigidly moved present-day outlines are available (and
labelled as such); historical borders are a work-in-progress compilation; no sky, people, works,
fauna or flora yet.

**Development:** `npm ci && npm test`. Code is MIT; each data source keeps its own licence,
credited on the site.

☕ [Support on Ko-fi](https://ko-fi.com/jaimeluisolguinmesina)
