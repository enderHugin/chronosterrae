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
- **Cielo de fondo** (sin botón ni panel: el creador decidió el 2026-11-07 que no hacían falta): detrás del
  globo se dibuja el cielo con estrellas, constelaciones, Sol, Luna con su fase y planetas, calculado para
  la fecha elegida (2001 a. C. a hoy) con calendario juliano hasta el 4-10-1582 y gregoriano después. El
  cálculo sigue en `sky/sky.js` y se contrasta con JPL Horizons en Actions (`data/sky/validation.json`);
  la web ya no muestra ese error, que sigue publicado en el repositorio.
- **Estrellas de la prehistoria** (−100.000 a −2001, solo estrellas, etiquetado «modelo»): movimiento
  propio **y velocidad radial** en 3D con el tiempo de luz exacto (`sky/stars3d.js`), precesión de largo
  plazo de Vondrák, Capitaine y Wallace 2011 (`sky/ltp.js`, tablas extraídas de ERFA, BSD-3) y rotación
  terrestre por el ángulo ERA. No hay Sol, Luna ni planetas antes del 2001 a. C. (sin efemérides fiables).
  Se verifica contra una implementación independiente en Python (`scripts/ref/stars3d_ref.py`, coinciden a
  0,000001″), contra el camino antiguo donde ambos valen y con casos físicos (Thuban, Vega). La web declara
  su precisión y sus límites: ΔT es allí una extrapolación, 401 estrellas no tienen velocidad radial medida
  y la estación del año real de la fecha proléptica no se afirma.
- **Sistema solar** (sin botón: es la continuación del zoom): al alejar el globo más allá del zoom mínimo, la Tierra
  (el propio mapa, a su tamaño real y orientado con el tiempo sidéreo) queda en medio del sistema con el Sol, la Luna, los
  planetas y las estrellas; toca un cuerpo para ir hasta él (Sol, Mercurio…Neptuno, Luna) y vuelve acercándote a la Tierra,
  con la fecha del reloj, de 2000 a. C. a hoy. Posiciones,
  fases y trayectorias de una revolución son un **cálculo** (astronomy-engine, MIT; `sky/solar.js`, 40 pruebas sin
  red). El error de la posición del centro de cada cuerpo se **midió contra JPL Horizons** (`scripts/validate-helio.js`,
  `data/sky/validation-helio.json`) y la pantalla lo muestra para la época: p. ej. ~2.500 km para la Tierra en 1700–2200
  y ~29.000 km para Júpiter (el de Marte y los gigantes incluye la diferencia centro-baricentro); crece hacia el pasado
  (~150.000 km para Venus hacia el 2000 a. C.). Radios: NASA NSSDCA e IAU 2015. Cada cuerpo se dibuja como esfera
  (elipsoide si está achatado) **orientada con su eje de rotación IAU**, con la **fase** real y, donde hay mapa verificado,
  con su **textura de misión espacial** (NASA/USGS, dominio público: Mercurio, Luna, Marte, Júpiter, Ío, Europa, Ganimedes,
  Calisto; `data/textures/`, con procedencia y huella en `manifest.json`). Saturno lleva sus **anillos con la opacidad medida
  por Cassini UVIS**, con sombra del planeta sobre los anillos y de los anillos sobre el planeta. Venus, Saturno, Urano y
  Neptuno no tienen mapa verificado y se dibujan en color medio ilustrativo; la web lo dice. Las lunas galileanas usan
  rotación síncrona aproximada (sin libraciones). Es una imagen del cuerpo **tal como lo vio una misión**, no de cómo se ve
  en la fecha elegida (las manchas de Júpiter cambian). `solar/sphere-render.js` es un módulo puro con pruebas
  (`npm run check:sphere-render`).
- **Vía Láctea de fondo** (en el sistema solar y tras el globo): la textura de la NASA (SVS 4851: Hipparcos-2, Tycho-2 y
  Gaia DR2; **sintetizada de catálogos, no una fotografía**) se proyecta en cada fotograma según la cámara, con la
  precesión de la fecha (también en la prehistoria, con el marco LTP). Se ven las Nubes de Magallanes porque están en los
  datos. El marco de la imagen se verifica contra los datos reales (`scripts/check-milkyway-data.py`, en CI: las nubes
  caen a 0,6° y 0,4° de su posición y el plano a b ≈ −0,7°), y las inversas de cámara, con pruebas de ida y vuelta
  (`npm run check:milkyway`). M31 y M33 **no** están en esa textura y todavía no se dibujan.
- **Estrellas y planetas tras el globo**: al alejarte (pellizco) ves el espacio con las estrellas
  del catálogo HYG (CC BY-SA 4.0, con movimiento propio) y los planetas, el Sol y la Luna en su
  posición real del instante elegido, más el terminador día/noche sobre el mapa. La Luna se oculta
  tras el globo, pero a distancias extremas puede quedar delante y entonces no se dibuja encima.
- **Paso de las flechas**: con el deslizador de tiempo seleccionado, ← → (y ↑ ↓) mueven el tiempo el paso que elijas en el
  selector de debajo, de 1 minuto a 100 millones de años (minutos, horas, días, semanas, meses, años, siglos, milenios…);
  Mayús o Re Pág/Av Pág = ×10; Inicio y Fin siguen como siempre. Los pasos de calendario conservan mes, día y hora (con el día
  recortado si el mes no lo tiene y respetando el salto de 1582); en el tiempo profundo la resolución es de 1 año y la web avisa.
  El paso elegido se recuerda en la cookie de preferencias (`sky/timestep.js`).
- **Reloj** con horas, minutos y segundos (tiempo real, pausa, acelerado, atrás), enlazado al deslizador.
- **Sucesos con hora conocida y avisos**: nacimientos, muertes, composiciones, obras, descubrimientos…
  El alcance decide qué se ve (ventana temporal ±6 meses, umbral de importancia según el zoom, un
  marcador por celda: nada se satura). Si la hora está documentada llega el aviso «dentro de 5 minutos…»,
  «acaba de…»; si solo se conoce el día, avisa al entrar en ese día («hora desconocida»). **Nunca se
  inventa una hora.** Hoy la semilla verificada tiene 5 sucesos con hora; la carga masiva desde Wikidata
  (CC0) se está construyendo en Actions.
- **Cambios del elemento centrado** (botón *Cambios*): qué cambia y qué sucesos lo rodean. Las fronteras son
  fotografías sueltas (1715, 1783, 1800…), así que un salto entre ellas **no ocurre en un día**: el panel dice
  qué instantánea se muestra y hasta qué fechas, qué estados aparecen, desaparecen o cambian de superficie entre
  las dos fotografías, y lista los sucesos de ese tramo con la relación **declarada**: causa/efecto documentados
  por la fuente (Wikidata P828/P1542, con enlace a su destino), mismo lugar, mismo nombre o solo la fecha. Solo lo
  primero viene de la fuente; lo demás es coincidencia y se rotula así. Cada suceso se despliega con evidencia,
  incertidumbre de la fecha y fuente. También lista los sucesos entre las dos últimas fechas en que miraste. Cada capa
  que cambia implementa un proveedor (`CHANGE_PROVIDERS` en `index.html`); el panel no conoce las capas.
- **Detalle al acercar**: desde zoom 4,6 se superpone el mapa vectorial actual de OpenFreeMap
  (OpenStreetMap, ODbL): estilo completo desde 1950, solo agua y vegetación hasta hace 11 000 años (como
  aproximación, y así se rotula) y nada antes, porque el nivel del mar era otro.
- ES/EN, tema claro/oscuro; idioma, tema, instante y cámara se recuerdan en una cookie propia.

## Límites conocidos (dichos sin adornos)

- De 535 a 1.000 Ma solo hay **contornos actuales movidos como bloques rígidos** (GPlates,
  modelo Merdith 2021). La web lo rotula; no son las costas reales de esa época.
- Las fronteras históricas son un mapa compilado y en elaboración: su precisión legal es alta, pero están dibujadas con muy pocos vértices (mediana de 10 a 30 km entre puntos), así que a zoom alto no encajan con la costa real. Contrástalas antes de citarlas.
  Esos polígonos son toscos y su borde que da al mar no es una frontera, sino una costa aproximada; la costa buena la pone el mapa. Por eso, a cualquier zoom, **solo se dibujan las fronteras compartidas entre países** (`map/borders-inner.js`) y la tierra hasta la costa (de cerca la de OpenStreetMap; de lejos, la del mapa base) se colorea con el país más cercano, con el mismo tinte que el polígono (hasta 100 km con la compilación histórica, 20 km con Natural Earth). De lejos el color nunca cae en el mar. El reparto entre dos vecinos junto a la costa es una aproximación gráfica, no un dato, y la web lo avisa (`map/borders-gap.js`).
  **De lejos, solo físico:** mientras el lienzo muestre más de ~20 % de cielo (esfera por debajo del 80 %) se muestra solo el mapa físico (con aviso); a partir de ahí se dibujan las fronteras (el zoom exacto depende del tamaño de pantalla y la latitud), con un botón *Fronteras* para ocultarlas (se recuerda en la cookie de preferencias). La resolución (mediana entre vértices; 1945: ~17 km) se mide en los propios polígonos de cada fecha (`map/borders-resolution.js`) y se declara en el aviso. Las vigentes (Natural Earth) no se tocan.
- Las estrellas vienen de HYG (CC BY-SA 4.0): los datos derivados se atribuyen y comparten igual
  (`data/sky/NOTICE.md`). El catálogo llega a magnitud ~6,5 y las posiciones se extrapolan con movimiento propio.
- Los sucesos con hora son pocos todavía y los anteriores al año 1 no están (la numeración a. C. de
  Wikidata aún no está calibrada). Wikidata da casi siempre solo el día: p. ej. Chopin, Poe o Pío XII no
  tienen hora documentada allí, así que no hay cuenta atrás para ellos, solo el aviso del día.
- El detalle al acercar es la **geografía de hoy** (OpenStreetMap), no una reconstrucción de la época;
  en tema oscuro conserva el estilo Liberty con colores adaptados.
- La precisión del cielo se degrada hacia el pasado (efemérides analíticas truncadas y ΔT, la
  rotación de la Tierra, que es una estimación antes de ~1600): la web muestra el error medido, no una promesa.
- Los **sucesos** vienen de Wikidata con notoriedad ≥ 25 enlaces: faltan los poco conocidos. Las **guerras** (intervalo con inicio y
  fin) entran solo si son de una clase histórica medida (guerra, batalla, asedio, guerra civil, operación, rebelión, campaña, serie de
  guerras, brote). El **lugar** de un suceso es su coordenada propia o, si no la tiene y su lugar (P276) es único, la de ese lugar
  (declarado en la cita: no es el punto exacto). Los **vínculos** de causa y efecto existen para unos 800 vínculos (381 de causa y 385 de efecto): casi todo lo que
  se lista por lugar, nombre o fecha es coincidencia, no causa, y se rotula así. El emparejado por nombre solo detecta el nombre
  exacto del estado en inglés o español del suceso.
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
labelled as such); historical borders are a work-in-progress compilation (the edge of a polygon facing the sea is not drawn, only borders shared between countries; land up to the coast takes the colour of the nearest country, a graphic approximation that the site flags); people, works,
fauna or flora yet; timed events are few so far (the bulk Wikidata load is being built).

**Development:** `npm ci && npm test`. Code is MIT; each data source keeps its own licence,
credited on the site.

☕ [Support on Ko-fi](https://ko-fi.com/jaimeluisolguinmesina)
