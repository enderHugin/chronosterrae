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
- **Fronteras vigentes de alta resolución desde 2016** (Natural Earth 10m, dominio público, ~1,7 km de
  mediana entre vértices; origen, commit y sha256 en `data/borders/manifest.json`). Ceuta y Melilla salen
  como España, igual que en OpenStreetMap. De 2016 a 2019 se aplican las vigentes (no se han comprobado una a una las diferencias menores de esos años; la web lo avisa). Antes de 2016 sigue la compilación histórica, mucho más gruesa: p. ej. en 2010 El Salvador tiene 29 vértices frente a 380 y su contorno se desvía hasta 23 km (Guatemala, hasta 43 km).
- **Tipo de evidencia en cada capa** (medición, documento, artefacto, modelo, reconstrucción,
  especulación), siempre visible.
- **Datos recientes** de un recolector diario (artículos más vistos de Wikipedia con coordenadas
  en Wikidata), mostrados solo en el presente.
- **Cielo** (botón «Cielo»): Sol, Luna con su fase, y Mercurio a Neptuno para cualquier fecha entre
  el 2001 a. C. y hoy, hora solar local y lugar (el centro del mapa o el que escribas), con calendario
  juliano hasta el 4-10-1582 y gregoriano después, refracción y crepúsculo. El cálculo está en
  `sky/sky.js` y se contrasta con JPL Horizons en Actions: **el error medido se muestra en la propia
  web** (segundos de arco hoy; unos 15′ para la Luna hacia el año 0 y ~1,2° hacia el 2000 a. C.).
- **Estrellas y planetas tras el globo**: al alejarte (pellizco) ves el espacio con las estrellas
  del catálogo HYG (CC BY-SA 4.0, con movimiento propio) y los planetas, el Sol y la Luna en su
  posición real del instante elegido, más el terminador día/noche sobre el mapa. La Luna se oculta
  tras el globo, pero a distancias extremas puede quedar delante y entonces no se dibuja encima.
- **Reloj** con horas, minutos y segundos (tiempo real, pausa, acelerado, atrás), enlazado al deslizador.
- **Sucesos con hora conocida y avisos**: nacimientos, muertes, composiciones, obras, descubrimientos…
  El alcance decide qué se ve (ventana temporal ±6 meses, umbral de importancia según el zoom, un
  marcador por celda: nada se satura). Si la hora está documentada llega el aviso «dentro de 5 minutos…»,
  «acaba de…»; si solo se conoce el día, avisa al entrar en ese día («hora desconocida»). **Nunca se
  inventa una hora.** Hoy la semilla verificada tiene 5 sucesos con hora; la carga masiva desde Wikidata
  (CC0) se está construyendo en Actions.
- **Detalle al acercar**: desde zoom 4,6 se superpone el mapa vectorial actual de OpenFreeMap
  (OpenStreetMap, ODbL): estilo completo desde 1950, solo agua y vegetación hasta hace 11 000 años (como
  aproximación, y así se rotula) y nada antes, porque el nivel del mar era otro.
- ES/EN, tema claro/oscuro; idioma, tema, instante y cámara se recuerdan en una cookie propia.

## Límites conocidos (dichos sin adornos)

- De 535 a 1.000 Ma solo hay **contornos actuales movidos como bloques rígidos** (GPlates,
  modelo Merdith 2021). La web lo rotula; no son las costas reales de esa época.
- Las fronteras históricas son un mapa compilado y en elaboración: su precisión legal es alta, pero están dibujadas con muy pocos vértices (mediana de 10 a 30 km entre puntos), así que a zoom alto no encajan con la costa real. Contrástalas antes de citarlas.
  Para que no queden franjas sin color junto a la costa, con el detalle activo se rellena **solo lo claro**: la tierra a menos de 40 km se pinta, más suave, con el color del país claramente más cercano (el otro debe estar a más del doble de distancia más 10 km); donde dos países están a distancias parecidas queda con un rayado neutro y la web avisa «frontera no resuelta a esta escala». Es un relleno gráfico aproximado, no un dato de frontera (`map/borders-gap.js`).
- Las estrellas vienen de HYG (CC BY-SA 4.0): los datos derivados se atribuyen y comparten igual
  (`data/sky/NOTICE.md`). El catálogo llega a magnitud ~6,5 y las posiciones se extrapolan con movimiento propio.
- Los sucesos con hora son pocos todavía y los anteriores al año 1 no están (la numeración a. C. de
  Wikidata aún no está calibrada). Wikidata da casi siempre solo el día: p. ej. Chopin, Poe o Pío XII no
  tienen hora documentada allí, así que no hay cuenta atrás para ellos, solo el aviso del día.
- El detalle al acercar es la **geografía de hoy** (OpenStreetMap), no una reconstrucción de la época;
  en tema oscuro conserva el estilo Liberty con colores adaptados.
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
(PaleoMAP: CC BY 4.0; historical-basemaps: GPL-3.0; HYG: CC BY-SA 4.0; Wikidata: CC0;
OpenFreeMap/OpenMapTiles/OpenStreetMap: ODbL).

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
recent data from a daily harvester, shown only at the present day; stars, planets, Sun and Moon behind the globe at their real position for the chosen instant (HYG catalogue, CC BY-SA 4.0), a running clock, timed events with advance notices only where the time of day is documented (never invented), and present-day OpenStreetMap detail when zooming in (labelled as an approximation, not a reconstruction). Language, theme, time and camera are remembered in a single first-party cookie (`ct_prefs`, one year, no tracking).

**Known limits:** from 535 to 1,000 Ma only rigidly moved present-day outlines are available (and
labelled as such); historical borders are a work-in-progress compilation (coastal gaps are filled conservatively: strips within 40 km are tinted with the clearly nearest country, those where two countries are at similar distances are hatched and flagged as unresolved); people, works,
fauna or flora yet; timed events are few so far (the bulk Wikidata load is being built).

**Development:** `npm ci && npm test`. Code is MIT; each data source keeps its own licence,
credited on the site.

☕ [Support on Ko-fi](https://ko-fi.com/jaimeluisolguinmesina)
