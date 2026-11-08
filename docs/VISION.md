# Visión de ChronosTerrae

> **Este documento es la memoria del proyecto.** Recoge lo que su creador quiere que
> ChronosTerrae llegue a ser. Cualquier persona o agente (humano o IA) que trabaje en el
> repositorio debe leerlo antes de tomar decisiones de diseño, y **no debe recortarlo
> por parecer ambicioso**: el rumbo se puede cambiar, el objetivo no.
>
> Última actualización: 2026-11-01.

## 1. Qué es

Un lugar al que **científicos de todo el mundo** vengan a consultar y a aportar detalles,
y al que **cualquier persona** pueda ir por placer a explorar. Algo serio, pero también
realista: poder entrar en otra época y ver cómo era.

### Lo que el creador pidió, con sus palabras

- «Absoluta granularidad y precisión.»
- Un lugar de consulta y aportación científica **y** de visita por placer.
- **Analizar fauna y flora.**
- **Recibir noticias en tiempo real.**
- **Alejarse hasta ver la galaxia o acercarse hasta ver insectos y microbios.**
- **La posición del globo, las estrellas y los planetas tienen su momento y lugar según
  hora y fecha.** Todo eso debe contemplarse.
- **Las costas reales de Pangea.**
- Poder **entrar a otra época y ver cómo la gente vestía, se desplazaba, hablaba…**
- **Fechas de nacimiento y muerte de gente conocida** (artistas…), **composiciones
  musicales, inventos…**
- **Futuro con gafas de VR.** Mucho más adelante, **con AR**: estar en cualquier lugar del
  planeta, ponerse las gafas y **mirar cómo se veía ese lugar en aquel entonces**.
- **Capas de verificación a voluntad del usuario:** lo no verificado se puede activar o desactivar; nada
  se oculta ni se disfraza de cierto. (Ya implementado para sucesos: nivel de revisión y tipo de evidencia.)
- **Futuros probables**, rellenados con especulación lo más ajustada posible: siempre como capa aparte,
  con evidencia `speculation` o `model`, apagada por defecto y con el modelo y sus supuestos declarados.
- **Estudiar la forma de vestir de cada época** (vestimenta, objetos, transporte), con la evidencia de cada
  detalle (pintura, texto, pieza de museo) y la reconstrucción rotulada como tal.
- **A largo plazo, algo parecido a un videojuego**, con VR y AR: moverse por el mundo y por las
  épocas, con las especies, la gente y los sucesos de cada lugar y momento.
- **Comunidad, y ahí entran las IAs:** la gente podría aportar su IA (quizá su cuenta) para
  dedicar recursos a la investigación, recopilación e implementación de datos, **de forma
  libre según especialización y según las solicitudes de búsqueda de usuarios y clientes.**
- Mandato explícito: el asistente puede **cambiar de dirección** para alcanzar los
  objetivos y puede escribir directamente en `main`.

## 2. Principios (no negociables)

1. **Trazabilidad antes que exactitud.** «Absoluta precisión» solo se puede prometer como:
   cada dato dice de dónde sale, con qué margen de error y de qué tipo de prueba depende.
   En el tiempo profundo la incertidumbre es real y se **muestra**, no se esconde.
2. **Sin fuente no hay dato.** Nunca se inventan DOI, identificadores de Wikidata,
   coordenadas ni fechas. Si no se puede verificar, el campo queda vacío y el registro no
   entra. (Una IA estuvo a punto de dejar un identificador inventado en el primer ejemplo;
   el CI debe impedirlo de forma automática.)
3. **Evidencia ≠ reconstrucción.** Cada elemento declara si es medición, documento,
   artefacto, reconstrucción, modelo o especulación, y la interfaz **siempre** lo muestra.
   Esto aplica con especial fuerza a cómo vestía, hablaba o se movía la gente.
4. **Federar para descubrir, archivar para perdurar.** Se conectan las bases que ya son la
   autoridad de cada campo (GBIF, PBDB, Wikidata, Macrostrat, GPlates…) para encontrar y
   contrastar datos, pero **todo lo que se contrasta y se acepta se guarda en un archivo
   propio**, con su fuente, fecha de recuperación y huella (sha256). Si una API cae, cambia
   o se retira (como la del Met, retirada el 2026-10-01), el dato ya contrastado sigue
   existiendo aquí. Origen: decisión explícita del creador (2026-11-01): las aportaciones
   de los usuarios deben permitir mantener una base de datos que conserve todo lo recabado.
   Límite: solo se archiva lo que la licencia de la fuente permite redistribuir, con su
   atribución.
5. **Un único estado: (instante, lugar, escala).** Cada capa responde a esa tupla y declara
   en qué rango de tiempo y escala es válida.
6. **Las IAs proponen, las personas con autoridad promueven.** Nada generado por una IA pasa
   de `community` sin revisión humana identificable (ORCID).
7. **Nunca se recogen cuentas ni claves de nadie.** Cada colaborador ejecuta su agente con
   su propia cuenta; el proyecto solo publica tareas y recibe datos.
8. **Licencias respetadas.** Datos GPL (p. ej. `historical-basemaps`) se cargan en tiempo de
   ejecución con atribución, no se copian al repositorio MIT.
9. **Calendarios.** Juliano y gregoriano no son intercambiables; toda fecha de día o mes
   declara el suyo.
10. **Preparado para AR/VR desde el primer dato:** posición absoluta, altura y margen de
    error de posición; formatos abiertos para 3D (glTF, 3D Tiles) cuando llegue el momento.

## 3. Arquitectura

### Estado único

```
(instante, lugar, escala)  ──►  cada capa responde o declara que no tiene datos
```

### Capas y fuentes

| Capa | Qué aporta | Fuente prevista | Estado (sonda 2026-11-01) |
|---|---|---|---|
| Paleogeografía | Costas y placas reconstruidas, Pangea. **OJO: el servicio de GPlates `coastlines` NO da costas antiguas reales**: mueve como bloques rígidos los contornos actuales (perímetro y nº de vértices idénticos a 250 y 500 Ma; Groenlandia con su forma de hoy). Sirve para ver el movimiento de las placas, no la geografía real de Pangea. Las costas reales requieren mapas paleogeográficos (PALEOMAP, Cao et al., Macrostrat…): **pendiente de fuente y licencia** | GPlates Web Service; a medio plazo precalculado con pyGPlates y publicado versionado | Responde con CORS (1,2–2,1 MB, 2–5 s). **La respuesta son polígonos sin propiedades: sin modelo ni edad.** Los modelos discrepan (250 Ma: Merdith 2021 = 2.214 polígonos, modelo por defecto = 1.636). Hay que registrar y archivar modelo+edad nosotros |
| Fronteras históricas | Polities de −123000 a 2010 | `aourednik/historical-basemaps` vía jsDelivr (GPL-3.0, solo en ejecución) | Responde con CORS. **Medido 2026-11-01:** precisión legal 3 (fijada por tratado) en 1945 y 2000, pero geometría gruesa (mediana 10–30 km entre vértices; Ceuta sin país, Melilla en Marruecos). **Criterio del creador (2026-11-02):** la costa es el mapa, no el borde del polígono; solo cuentan las fronteras entre países (tramos compartidos, `map/borders-inner.js`) y la tierra hasta la costa se colorea con el país más cercano (`map/borders-gap.js`, ≤100 km; ≤20 km con Natural Earth; mediatriz entre vecinos = aproximación gráfica declarada). De cerca la costa la pone OpenStreetMap; de lejos, la tierra del mapa base como máscara, de modo que el color nunca cae en el mar. Sigue siendo una aproximación: la geometría buena para antes de 2016 depende de una fuente mejor (OpenHistoricalMap, sin probar) |
| Fronteras vigentes | Países desde 2016 (2016–2019 con aviso) | Natural Earth 10m (dominio público), copiado a `data/borders/` con manifiesto | Mediana 1,7 km; Ceuta y Melilla en España. geoBoundaries (CC BY 4.0) llega a ~10 m pero pesa 25 MB solo para España. **OpenHistoricalMap** (CC0 declarado) y **CShapes** pendientes de verificar para fronteras con fecha |
| Geología | Unidades, intervalos | Macrostrat | Responde con CORS |
| Fósiles | Ocurrencias con edad y lugar | Paleobiology Database | Responde con CORS |
| Vida actual | Fauna y flora | GBIF, iNaturalist | Responden con CORS |
| Taxonomía | Árbol de la vida | Open Tree of Life | Responde con CORS |
| Personas, obras, inventos | Nacimientos, muertes, composiciones, inventores | Wikidata (+ MusicBrainz, IMSLP) | Servicio OK (consulta trivial: 5 s). **La consulta «nacidos en tal fecha» agotó 25 s: era demasiado pesada, reformular** |
| Efemérides | Qué pasó tal día | Wikipedia «On this day» | Responde con CORS |
| Vestimenta, objetos, imágenes | Cómo vestían, qué usaban | Met Open Access (CC0), Wikimedia Commons, Europeana | Commons OK. **Met: migrar a `/v1.1/search`** (v1 retirado el 2026-10-01). Europeana requiere clave |
| Literatura científica | Citas y respaldo | OpenAlex, Crossref | **OpenAlex exige clave de API**: llamar desde Actions |
| Directo | Terremotos, eventos naturales | USGS, NASA EONET (+ noticias geolocalizadas) | Responden con CORS |
| Cielo | Sol, Luna, planetas, estrellas | Cálculo en el cliente (efemérides + catálogo HYG con movimiento propio, CC BY-SA 4.0), validado en CI contra JPL Horizons | Horizons **sin CORS**: solo para validar en CI. Fondo espacial tras el globo con la proyección real de la cámara |
| Mapa base y detalle | Teselas de fondo; detalle vectorial al acercar | OpenFreeMap (OpenStreetMap, ODbL, sin claves ni límites) | **Sonda 2026-11-01: estilo Liberty, TileJSON, teselas z6–z14, glifos y sprite responden con CORS `*`.** Es geografía actual, no reconstruida |

### Sucesos con hora y avisos

Un suceso es un registro del esquema (`kind`, `importance`, `labels`, `time.precision` de segundo a año,
`time.instant` solo si la hora está documentada, geometría nula permitida). Se parten en trozos por siglo
(`data/events/c<siglo>.json` + `index.json` + `manifest.json`) y `seed.json` siempre se carga. La vista no
se satura porque **el alcance decide**: una ventana temporal alrededor del reloj (±183 días parado; con el tiempo corriendo es
proporcional a la velocidad, ver abajo), un umbral de importancia que sube al alejarse (por anchura de vista) y con la velocidad, y un
marcador por celda de pantalla (máx. 80).
Los avisos salen solo al recorrer el reloj hacia delante (a 300, 60 y 10 s y «ahora» si hay hora; al
entrar en el día si solo hay día). **Principio: la hora es un dato, no un adorno; sin fuente no hay
cuenta atrás.** Wikidata suele traer solo la fecha, de modo que los sucesos con hora real son escasos
y hay que ir verificándolos uno a uno.

### Rigor de los datos (criterio del creador: «lo mejor de lo mejor, contrastado, cada detalle»)

- Cada registro lleva **nivel de revisión** (`raw`, `community`, `reviewed`, `consensus`) y **tipo de evidencia**; la web los
  muestra y deja al usuario elegir qué ver. Lo masivo de Wikidata entra como `raw` y se dibuja atenuado.
- `scripts/check-data.js` separa **errores nuestros** (fecha escrita frente a la calculada, siglo del fichero:
  hacen fallar el CI) de **anomalías de los datos** (muerte antes de nacer, edad imposible, fecha futura): estas se
  apartan en la construcción y se cuentan, nunca se corrigen ni se adivinan. 27 422 registros: 0 errores propios.
- **Límite conocido:** la importancia actual es el número de artículos de Wikipedia, que mide fama y no relevancia
  científica (sesgo moderno y occidental). Debe sustituirse por listas curadas por personas expertas por área.
- Un dato generado por IA no supera `community`; `reviewed` y `consensus` exigen personas con autoridad en el área.

### Archivo propio (resiliencia)

Tres niveles, de más volátil a más duradero:

1. **Fuentes vivas** (APIs externas): para descubrir y contrastar. Pueden caer o cambiar.
2. **Archivo de ChronosTerrae**: copia de lo contrastado y aceptado, que es lo que sirve la
   web. Registros pequeños y revisados en **Git** (esquema + CI); volúmenes grandes
   (teselas, rásteres, instantáneas de modelos) en **almacenamiento de objetos** direccionado
   por hash, referenciado desde Git.
3. **Preservación a largo plazo**: publicaciones versionadas con DOI (p. ej. Zenodo) y copia
   en el Internet Archive, para que el proyecto sobreviva a sus propios servidores.

Cada fuente de un registro lleva `retrieved_at`, `sha256` y, si existe, `archive_url`. Las
respuestas sin metadatos (como las costas de GPlates, que llegan como polígonos desnudos sin
modelo ni edad) se archivan **con el modelo, la versión y la edad con que se pidieron**.

Esto cuesta almacenamiento y mantenimiento: el modelo de «cero coste» solo vale para la
fase inicial. La financiación comunitaria (Ko-fi y similares) debe cubrir el archivo.

### Cielo en el tiempo profundo

Se calcula, no se almacena. **Estado real (medido el 2026-11-01 contra JPL Horizons/DE441,
`data/sky/validation.json`)**: con astronomy-engine (series analíticas truncadas) el error de Sol,
Luna y planetas es de segundos de arco entre 1700 y 2200, pero crece hacia el pasado: ~1′–3′
hacia el año 1000, ~15′–19′ para la Luna hacia el año 0 y 500 a. C., y ~1,2° (Luna) / ~24′
(planetas) hacia el 2000 a. C. Para precisión de efeméride en la antigüedad hay que pasar a series
completas (VSOP87/ELP-MPP02) o a DE441 directamente. Aparte, ΔT (la rotación terrestre) es una
estimación antes de ~1600 y desplaza el cielo local. Más atrás de unos milenios entran modelos con
incertidumbre creciente (hace ~600 Ma el día duraba ~21 h y la Luna estaba más cerca). Se muestra
como **modelo con su margen medido**, nunca como certeza.

### Escalas extremas

De 10⁻⁶ m a 10²¹ m. El globo/mapa cubre aproximadamente de 100 m a todo el planeta. Los
extremos (galaxia, microbio) se resuelven con **traspasos con contexto** (misma fecha y
lugar) a visores especializados; reconstruirlos desde cero es un proyecto aparte.

### Comunidad y agentes de IA

- Las **peticiones de datos** nacen de búsquedas sin resultado y se publican como issues
  etiquetados por área, época y región.
- Cada colaborador ejecuta **su propio agente con su propia cuenta**; el agente elige
  tareas según su especialización y entrega un **PR de datos** (`status: raw`, con modelo
  y operador registrados).
- El **CI verifica** DOI (Crossref), identificadores de Wikidata y, donde se pueda, que la
  fuente contiene el valor. El CI **nunca ejecuta código aportado**, solo datos.
- Promoción a `reviewed`/`consensus` solo por personas con autoridad en el área (ORCID,
  `CODEOWNERS` por área).
- Peticiones de pago de «clientes»: decisión posterior, cuando haya algo que ofrecer.

## 4. Hoja de ruta

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Cimientos: CI en Node 22, esquema con procedencia, validador y pruebas, sonda de fuentes | **Hecho** |
| 1 | Globo con viaje en el tiempo: costas paleogeográficas reales (PaleoMAP, 0–535 Ma), fronteras históricas (−123000 a 2010), slider logarítmico | **Hecho** (falta 535–1000 Ma real) |
| 1b | Archivo propio: paleocostas convertidas con manifiesto (licencia, DOI, md5/sha256, parámetros) en `data/paleocoastlines/` | **Hecho** para paleocostas; pendiente para el resto de capas |
| 2 | Cielo: Sol, Luna, planetas y estrellas según instante y lugar | **Hecho en lo esencial**: Sol, Luna, planetas (validados 2001 a. C.–hoy), estrellas HYG, fondo espacial tras el globo, terminador, reloj. **Vista del sistema solar** (2026-11-02; desde 2026-11-03 sin botón, como continuación del zoom del globo: la Tierra es el mapa real escalado y orientado, contrastado con la proyección del globo): centro elegible, zoom del sistema entero al cuerpo, fases y trayectorias reales, error heliocéntrico medido contra Horizons. Falta efeméride más precisa en la antigüedad, la Luna delante del globo a distancias extremas, y en el sistema solar: texturas y relieve reales (licencia y descarga sin sondear), rotación de cada planeta sincronizada con el reloj (ejes IAU WGCCRE; `Astronomy.RotationAxis` ya los trae), achatamiento, anillos de Saturno, lunas de otros planetas, órbitas más allá de Neptuno |
| 3 | Personas, obras e inventos (Wikidata/MusicBrainz) con calendario correcto | **En curso**: modelo, selección por alcance, avisos y semilla verificada hechos; carga masiva desde Wikidata en construcción; extinciones sin cosechar; antes del año 1 pendiente |
| 4 | Vida: fauna y flora actual y fósil, taxonomía | Pendiente |
| 5 | Directo: terremotos, eventos naturales, noticias geolocalizadas | Pendiente |
| 6 | Inmersión por época: vestimenta, objetos, transporte, lengua, con tipo de evidencia | Pendiente |
| 7 | Contribución: peticiones de datos, verificación automática de fuentes, PR de agentes, revisión por tiers | Pendiente |
| 8 | Traspasos a escalas extremas; WebXR (VR) | Pendiente |
| 9 | AR geoespacial | Futuro |

## 5. Decisiones tomadas

- **Se abandona el «enjambre de IAs con CRDT»** del README original. No existe en el código
  y no resuelve el problema real, que es la confianza. Se sustituye por datos en Git con
  esquema, procedencia y revisión humana. (Las IAs de la comunidad siguen siendo parte de
  la visión, ver §3.)
- **Los datos son ficheros en Git**, validados por CI. No hay base de datos propia.
- **Costes mínimos al principio:** sitio estático, llamadas a APIs desde el navegador,
  trabajo pesado en GitHub Actions. **Con el archivo propio ese objetivo se relaja**
  (ver §3 «Archivo propio»).

## 6. Pendiente de aclarar

- **Costas reales de Pangea: RESUELTO para 0–535 Ma** con *PaleoMAP PaleoCoastlines*
  (Kocsis & Scotese, CC BY 4.0, doi:10.5281/zenodo.7994000), derivado de los PaleoDEM e
  incluyendo inundación continental. Se archiva en `data/paleocoastlines/` con
  `scripts/build-paleocoastlines.js`. Pendiente: de 535 a 1000 Ma solo hay contornos
  rígidos de GPlates (rotulados como tales); el DOI del artículo asociado
  (10.1016/j.earscirev.2020.103463) venía de la ficha de Zenodo y **está verificado en
  Crossref** (sonda del 2026-11-01): «Mapping paleocoastlines and continental flooding
  during the Phanerozoic», Kocsis y Scotese, *Earth-Science Reviews*, 2021. Falta quitar la
  nota «pendiente de verificar» del manifiesto en la próxima publicación de datos.
- **Catálogo de estrellas: RESUELTO con HYG** (CC BY-SA 4.0, con atribución y aviso en
  `data/sky/NOTICE.md`; constelaciones de d3-celestial, BSD-3). Hipparcos quedó descartado por su licencia
  no comercial. `scripts/build-stars.js` reconstruye `data/sky/` desde el CSV con su commit fijado.
- **Estrellas de la prehistoria (±100.000 años): HECHO como «fase 1» (solo estrellas)**, 2026-11-02, a petición del
  creador («¿estrellas de prehistoria con precisión científica?»). `sky/stars3d.js` (3D con velocidad radial y
  tiempo de luz), `sky/ltp.js` (precesión de largo plazo, ±200.000 años), `sky/prehistory.js` (une todo con la rotación
  terrestre ERA), `data/sky/stars3d.json`. Verificado con Python independiente y casos físicos; la web declara límites.
  **Pendiente / no hecho**: Sol, Luna y planetas en la prehistoria (haría falta una efeméride numérica larga, p. ej. DE441,
  sin sondear), la estación del año real (depende de ΔT, extrapolado antes de ~700 a. C.), nutación, y las 115 estrellas
  débiles de hoy sin velocidad radial que podrían haberse visto (se cuentan en `data/sky/manifest.json`).
  El cotejo contra la **implementación C de ERFA** quedó sin hacer: el entorno bloqueó compilar código externo; lo sustituyen
  las tablas extraídas por programa (con sha256), holonomía exacta, convergencia h², acuerdo con astronomy-engine 1900–2100,
  Thuban, Vega y Polaris.
- El creador ofreció compartir su conversación previa con **opencode** para ver qué se
  intentó y no se logró. **Aún no ha llegado.** Revisarla puede cambiar el orden de la
  hoja de ruta.
- Licencia de los modelos de placas concretos (Merdith 2021, Müller, Scotese) antes de
  redistribuir teselas precalculadas.

## Fronteras históricas y resolución (2026-11-03)

Los polígonos de historical-basemaps traen un vértice cada 13–20 km de mediana (solo −5000 llega a ~2,5 km; medido en las 100+ fechas). Decisión del creador: de lejos (zoom < 4) solo mapa físico; de cerca, fronteras con un botón para ocultarlas. (Una primera versión lo hizo al revés —cortar de cerca— y se corrigió.) Pendiente: fronteras de mejor resolución para el tramo reciente (OpenHistoricalMap, sin sondear).


## Cambios, causas y escala (2026-11-06)

Petición del creador: para el elemento centrado, listar los sucesos que provocan sus cambios (geológicos: el terremoto o impacto si está registrado; históricos: la guerra, el pacto…), cada uno desplegable, con el nivel de detalle que atraiga a historiadores y científicos, y **diseñado para escalar a infinito**.

Decisiones:
- **Un cambio es un intervalo, no un día.** Las fotografías de fronteras están separadas años; el panel lo dice y nunca atribuye el salto a una fecha.
- **Causa solo con fuente.** El esquema tiene `links` (cause, effect, part_of, participant) con fuente por vínculo. Lo demás (lugar, nombre, fecha) se muestra como coincidencia, en este orden de fuerza: documentado > lugar > nombre > fecha. Nunca se infiere causalidad.
- **Relaciones como datos, no cálculo del cliente.** Se recolectan en el build (`scripts/build-events.js`, una consulta por propiedad: juntas con OPTIONAL la sonda midió 86 344 filas y 20 s para 300 elementos) y viajan en los fragmentos por siglo. El cliente pide solo el intervalo que mira.
- **Proveedores de cambios.** Cada capa (fronteras, relieve/placas, y las que vengan: nivel del mar, hielo, estrellas…) implementa `applies / describe`; el panel las recorre sin conocerlas.
- **La clase viene de la fuente** (`classes`, Wikidata P31, tabla `CLASS_KINDS` con QID de la sonda); el nombre solo se usa cuando falta y se rotula como deducido.
- **Pendiente para historiadores y científicos:** causas más allá de P828/P1542 (participantes P710/P1344, país P17), fuentes primarias por suceso (más allá de Wikidata), sucesos geológicos (terremotos, impactos, erupciones: hoy ninguno antes del año 1), diferencia de fronteras por identificador estable y no por nombre, geometrías de lugar con incertidumbre, y el fundido gradual del relieve natural en lugar del corte seco de 4051 a. C.
- Datos derivados de historical-basemaps (GPL) no se guardan en el repositorio: la diferencia entre instantáneas se calcula en el navegador al vuelo.
- **Cuándo se dejan de ver las fronteras (2026-11-07).** Lo decide el creador: cuando el lienzo empieza a mostrar ~20 % de cielo y ~80 % de esfera (`BORDER_MIN_COVER = 0.80`, `map/sphere.js`), no un zoom fijo. La fracción se mide sobre el lienzo con el disco de la Tierra de la capa de cielo, así que depende del tamaño de pantalla, la inclinación y la latitud (a 45° N: zoom 3,6 en 1920×1080, 3,0 en 1280×800, 2,1 en un móvil vertical). Contrastado con la fracción de píxeles de cielo del render real: diferencia ≤ 0,2 puntos. Histéresis de 2 puntos al alejarse. Se aplica igual a las fronteras históricas y a las vigentes (antes: zoom 4 y 2,5); el zoom fijo queda de reserva si no se puede medir.
- **Lo político no desaparece nunca en un cambio de fecha (2026-11-07).** Medido leyendo los píxeles del render, quitar la imagen de franjas vieja al aplicar la instantánea nueva dejaba un fotograma con el 15 % del color político visible (teselas vectoriales nuevas aún sin cargar). Ahora el cambio es atómico: si hay una imagen puesta y va a venir otra, se mantiene TODO lo político antiguo (imagen, relleno, líneas, nombres) y solo cuando la imagen nueva está calculada entran a la vez los datos vectoriales y la imagen (`commitBorders`; cota de 1,5 s). Mínimo medido: 98–99 %. La sonda de captura mide esto mismo con red real (`continuity.json`). Mientras dura, el estado avisa de qué instantánea se ve y clic/resaltado están inactivos.
- **El panel Cielo se queda (2026-11-07).** Se retiró y el creador pidió restaurarlo: el recuadro circular (Sol, Luna, planetas y estrellas del lugar y el instante) es donde se ven los planetas del cielo local. Se restauró con un revert del commit de retirada, conservando todo lo posterior (texturas, Vía Láctea, nombres geográficos, carreteras, fondo más oscuro).
- **Nombres geográficos y carreteras (2026-11-07).** Sin *Fronteras*, el mapa solo rotula accidentes geográficos: se conservan las capas `water_name` (mar, bahía, estrecho, lago), `waterway` (río, canal) y `mountain_peak` (con `ele` en m) y las islas de `place`; se descartan país, estado, ciudad, pueblo y demás (`map/labels.js: geoNames`, probado contra las capas reales del estilo Liberty, sonda `probe-ofm-labels`). Los ríos con nombre bajan a z6 (las teselas los traen desde z6; el estilo los rotula desde z10). Las **carreteras** (`transportation` y `transportation_name`: calzadas, ferrocarril, caminos, flechas de sentido, nombres y escudos) son una capa con su botón, apagada por defecto, solo en el mapa actual y de cerca. En épocas anteriores (modo `physical`) el detalle solo trae agua, cauces y cobertura del suelo: los ríos se ven como línea, sin nombre. Pendiente: nombres de cordilleras, desiertos y cabos (no existen en OpenFreeMap; harían falta Wikidata/GeoNames).
- **Velocidad al mover el slider (2026-11-06).** El mapa político nunca debe desaparecer entre dos épocas: mientras se descarga la instantánea nueva se mantiene la anterior (fronteras, color, nombres) con un aviso en el estado de que no corresponde a la fecha, y se sustituye de golpe; clic y resaltado quedan inactivos mientras tanto. El relieve de NASA va DEBAJO del color político (se ven los accidentes geográficos) y se enciende después: con el botón Fronteras activo, lo político se pinta primero y el relieve cuando ya está en pantalla; con las fronteras ocultas o lejos, solo el relieve y no se calcula nada político (sin imagen de franjas ni nombres). Una descarga por archivo (compartida entre precarga y petición, no se cancela al mover el slider y se reutiliza: antes una instantánea abandonada y vuelta a pedir se bajaba dos veces, medido) y `force-cache` para las fijadas a un commit. Se precargan las 4 instantáneas más cercanas (antes 2). Límite que queda: la descarga en frío (0,2–0,8 s por archivo medido antes) y ~0,25 s de la imagen de franjas.
- **Texturas científicas, anillos y lunas (2026-11-07).** Lo pide el creador ("textura científicamente ajustada para planetas, anillos y lunas"). Regla: solo imagen de misión con procedencia verificada y huella (`data/textures/manifest.json`, `npm run check:textures`); lo que no la tiene (Venus: solo radar; Saturno, Urano, Neptuno) se dibuja en color medio y la web lo dice. Los anillos de Saturno usan la profundidad óptica medida por Cassini UVIS (Becker y Jarmak 2023), no un dibujo. Límites declarados en pantalla: Júpiter es el techo de nubes de diciembre de 2000; las lunas galileanas giran de forma síncrona aproximada (sin libraciones); el color de los anillos y su albedo son ilustrativos.
- **Vía Láctea de fondo (2026-11-07).** Lo pide el creador ("mayor realismo en el cielo: galaxias, etc."). Se usa la textura de la NASA SVS 4851 (sintetizada de catálogos; la web dice que no es una fotografía), con la precesión de la fecha. El marco se verificó contra los datos (Nubes de Magallanes, plano galáctico) y la prueba rechaza imágenes alteradas. **Pendiente, sin inventar datos:** M31 y M33 no vienen en la textura; para dibujarlas hay que traer posición, tamaño y ángulo de una fuente primaria (SIMBAD/NED) con un workflow y rotularlas como símbolo esquemático.
- **La CI ejecuta ahora `npm test` completo (2026-11-07).** Antes solo corría `check`, `check:sky`, `check:events` y `validate`, de modo que las pruebas de datos, vista solar, texturas, renderizador y Vía Láctea no se ejecutaban en CI. Además se instala pillow/numpy para `scripts/check-milkyway-data.py`.
- **Dos defectos de prueba encontrados y corregidos al hacerlas (2026-11-07), para no repetirlos:** una prueba que devuelve una promesa pasa en vacío si el ejecutor es síncrono (ahora `check` espera las promesas), y un centroide sobre un disco sin señal cae en el centro del disco, es decir, justo en la posición esperada (ahora se exige además contraste real y se comprobó que la prueba falla con imágenes alteradas).
- **Iconos de sucesos y recuadros que se ocultan (2026-11-08).** Lo pide el creador (iconos animados de borde blanco que representen lo que son: espadas, mosquetes, tanques, pluma y papiro, anillos…; ocultar solos los recuadros informativos tras 2 s con fundido, en niveles, configurable, movibles, «mostrar siempre» y deshacer con Ctrl+Z, con botones en pantallas táctiles). Decisiones: (1) el icono sale de las **clases de Wikidata del registro** y cada QID de la tabla `ICON_CLASSES` está contrastado por prueba con los datos reales (QID y etiqueta); solo sin clases se deduce del nombre, con el mismo criterio de `changes.js`; (2) **espada / mosquete / tanque es una convención de época** (corte en 1500 y 1914) para distinguir guerras de un vistazo, no una afirmación sobre el armamento de cada conflicto, y así se declara; (3) los sprites llevan el borde blanco dibujado (no SDF) y la capa `events-circle` se conserva como zona de toque **invisible**, para que hover y clic sigan funcionando igual; (4) la animación solo mueve propiedades de pintura con transiciones de MapLibre y deja reposo entre fases, porque una animación continua impide el evento `idle` y las capturas automáticas; se apaga en *Ajustes*, con la pestaña oculta y si el sistema pide reducir movimiento; (5) la ocultación automática está **desactivada por defecto** (nivel 0): el creador pidió una opción, no cambiar el comportamiento de todos; (6) los recuadros usan atributos `data-*` y no clases porque `setStatus` reescribe `className`; (7) el deshacer cubre ocultar y mover recuadros, no la selección del mapa; cerrar la ficha con × se deshace restaurando también el resaltado. Pendiente: verificar en el render real (`probe-shot`, modo `iconos`) y ajustar tamaño y densidad de iconos con lo que se vea.

- **Ventana de sucesos proporcional a la velocidad del tiempo, fundido y entrada animada (2026-11-08).** Lo pide el creador: el tiempo que se muestra un suceso debe ser proporcional a la velocidad del paso del tiempo (a 10 años por segundo, sucesos de ese orden de años y más transparentes los más antiguos, en varios niveles), sin exigir la exactitud de día y hora, y con sucesos más animados pero serios, sin aire de juego. Decisiones: (1) un **medidor de movimiento** (`createMotion` en `sky/timed.js`) mide los segundos simulados por segundo real a partir de las notas del reloj; solo cuentan las notas continuas (<400 ms entre sí), así un salto aislado de época no ensancha la ventana; sube en 0,4 s y baja en 2,5 s; (2) `windowFor(velocidad)`: parado ±183 d; en marcha, el pasado visible (el lado del que viene el tiempo) es `min(100 años, |velocidad|·6 s)` y el futuro `max(30 d, pasado/8)`, para que los sucesos aparezcan al llegar el reloj; (3) **fundido en cuatro niveles** según la fracción de edad dentro de la ventana (≤15 %→1, ≤40 %→0,8, ≤70 %→0,55, resto 0,32), que se multiplica por la opacidad del estado de revisión sin sustituirla; (4) **umbral de importancia según la longitud de la ventana** (≤400 d: ninguno; ≤3700 d: 0,45; ≤11000 d: 0,62; más: 0,78): a gran velocidad solo lo significativo, porque si no se satura; los 6 s y esos umbrales son **parámetros editoriales**, no medidas; (5) la **entrada animada** es una secuencia de 10 fotogramas pre-dibujados (1,1 s; el último es el sprite estático) con un gesto propio por tipo (espadas que se cruzan, tanque que avanza, tratado que se escribe, bandera que se despliega, papeleta que baja a la urna…), elegidos desde un único bucle de 90 ms que solo corre mientras algo entra; se descartó lo que parecería un juego (golpes, humo, lápida que sale de la tierra) y se apaga con el resto de animaciones; (6) crear los sprites con `getImageData` sobre un lienzo con GPU tardaba ~1,5 s para ~100 fotogramas; se corrigió con `willReadFrequently: true` (medido con el perfilador). Lección de pruebas: los ayudantes `check` que daban por buena cualquier salida distinta de `false` ocultaron una prueba que fallaba desde hacía tiempo; ahora **solo `true` pasa** (check.js, check-events.js, check-sky.js). Pendiente: verificar en el render real (`probe-shot`) y ajustar con lo que se vea.
