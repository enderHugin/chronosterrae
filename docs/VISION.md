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
| Cielo | Sol, Luna, planetas, estrellas | Cálculo en el cliente (efemérides + catálogo con movimiento propio), validado en CI contra JPL Horizons | Horizons **sin CORS**: solo para validar en CI |
| Mapa base | Teselas de fondo | Carto | Responde con CORS |

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

Se calcula, no se almacena. Con efemérides publicadas (JPL DE441) es fiable durante unos
30.000 años; las estrellas llevan movimiento propio. Más atrás entran modelos con
incertidumbre creciente (ΔT de la rotación terrestre incierto en la antigüedad; hace
~600 Ma el día duraba ~21 h y la Luna estaba más cerca). Se muestra como **modelo con su
margen**, nunca como certeza.

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
| 1 | Globo con viaje en el tiempo: costas reales (GPlates), fronteras históricas, slider | En curso |
| 1b | Archivo propio: instantáneas de costas por modelo y edad con hash y atribución; campos de archivo en el esquema | En curso |
| 2 | Cielo: Sol, Luna, planetas y estrellas según instante y lugar | Pendiente |
| 3 | Personas, obras e inventos (Wikidata/MusicBrainz) con calendario correcto | Pendiente |
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

- **Costas reales de Pangea (prioridad alta).** El creador pidió explícitamente «las costas
  reales de Pangea». La fuente actual (GPlates `coastlines`) solo desplaza contornos
  actuales; la web lo dice así en pantalla. Hay que encontrar una fuente de paleogeografía
  real (líneas de costa con mares someros) con licencia compatible y verificar su formato
  con la sonda antes de integrarla.
- El creador ofreció compartir su conversación previa con **opencode** para ver qué se
  intentó y no se logró. **Aún no ha llegado.** Revisarla puede cambiar el orden de la
  hoja de ruta.
- Licencia de los modelos de placas concretos (Merdith 2021, Müller, Scotese) antes de
  redistribuir teselas precalculadas.
