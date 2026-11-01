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
| Fronteras históricas | Polities de −123000 a 2010 | `aourednik/historical-basemaps` vía jsDelivr (GPL-3.0, solo en ejecución) | Responde con CORS |
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
se satura porque **el alcance decide**: ventana de ±183 días alrededor del reloj, un umbral de
importancia que sube al alejarse (por anchura de vista) y un marcador por celda de pantalla (máx. 80).
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
| 2 | Cielo: Sol, Luna, planetas y estrellas según instante y lugar | **Hecho en lo esencial**: Sol, Luna, planetas (validados 2001 a. C.–hoy), estrellas HYG, fondo espacial tras el globo, terminador, reloj. Falta efeméride más precisa en la antigüedad y la Luna delante del globo a distancias extremas |
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
- El creador ofreció compartir su conversación previa con **opencode** para ver qué se
  intentó y no se logró. **Aún no ha llegado.** Revisarla puede cambiar el orden de la
  hoja de ruta.
- Licencia de los modelos de placas concretos (Merdith 2021, Müller, Scotese) antes de
  redistribuir teselas precalculadas.
