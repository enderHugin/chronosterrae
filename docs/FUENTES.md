# Fuentes: inventario, licencias y contraste

Pedido del creador (2026-11-14): «necesitamos fuentes de datos más fiables y revisión… más intensiva y proactiva». Eligió:
**inventario de fuentes fiables, búsqueda proactiva y contraste**.

Este documento es el inventario. Reglas para mantenerlo:

- Una licencia figura como **verificada** solo si se ha leído en la página de la propia fuente. Se anota dónde y cuándo.
- Lo demás figura como **pendiente**. Lo resuelve la sonda semanal (`scripts/probe-sources.js`, workflow `sources.yml`, rama `sources`).
  - La sonda guarda la frase exacta de la página, no una conclusión.
  - Distingue «la página no dice licencia» de «la página no se pudo leer».
- **¿Al repo?** El repositorio es MIT.
  - Sí: dominio público, CC0 y CC BY. Con atribución en `NOTICE.md` y diciendo qué se cambió.
  - Solo en ejecución: GPL (regla 4).
  - No: lo que prohíbe redistribuir. Tampoco en ejecución, salvo permiso escrito.
- Una IA puede proponer fuentes o leer los extractos de la sonda. Pero lo que sube de nivel lo decide una persona con la frase delante: la IA no pasa de `community`.

## Fronteras y entidades políticas

| Fuente | Qué da | Cobertura | Licencia (dónde y cuándo) | ¿Al repo? | Estado |
|---|---|---|---|---|---|
| **Cliopatria** (Seshat) | Polígonos por entidad con `FromYear`/`ToYear` (una fila por cada cambio), Wikidata por fila | −3400 a 2024 | **CC BY 4.0**: `LICENSE.md` del repo [Seshat-Global-History-Databank/cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria), commit `5f43337` (2026-10-03), leído 2026-11-14 | Sí, con atribución | **Verificada y medida** (abajo) |
| historical-basemaps (A. Ourednik) | Instantáneas en 54 años de mapa; también pueblos sin estado | −123000 a 2010 | GPL-3.0 (`LICENSE` del repo, commit fijado `da7a4b7`) | No: en ejecución | En uso |
| Natural Earth | Países actuales; tierra actual | Hoy | Dominio público ([condiciones](https://www.naturalearthdata.com/about/terms-of-use/)) | Sí | En uso (desde 2016) |
| OpenHistoricalMap | Fronteras y lugares fechados (`start_decdate`/`end_decdate`), teselas vectoriales | Desigual: lo que hayan mapeado | **CC0 salvo lo marcado**: «Except where otherwise noted, OpenHistoricalMap data is dedicated to the public domain under a Creative Commons CC0 dedication». Algunos elementos van con CC BY o CC BY-SA «as noted in license=* tags on individual elements» ([copyright](https://www.openhistoricalmap.org/copyright), sonda 2026-11-14) | Sí lo CC0; hay que mirar la etiqueta `license` de cada elemento | Verificada. Teselas: responden con CORS `*`. Pendiente: medir cobertura |
| CShapes 2.0 | Fronteras de estados con fecha de cambio | 1886 a hoy | **CC BY-NC-SA 4.0**: «licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License» ([CShapes](https://icr.ethz.ch/data/cshapes/), sonda 2026-11-14) | **No**: no comercial y «compartir igual» chocan con MIT | Descartada para el repo |
| **HistoGIS** (Academia de Ciencias de Austria) | Unidades políticas y administrativas con sus fechas de validez: fronteras de toda Europa; provincias y condados en Europa central, Austria-Hungría y los estados alemanes | ~1815–1919 | **CC BY 4.0** (su ficha en [ARCHE](https://arche.acdh.oeaw.ac.at/browser/oeaw_detail/105578), leída 2026-11-14). Ojo: para Hungría la propia ficha dice «there are no exact start and end dates» | Sí, con atribución | Verificada; pendiente de medir |
| **GSH**, Office of the Historian (EE. UU.) | Nombres y tipo de cada territorio (estado o dependencia), sus años de validez, predecesor y sucesor, y el tipo de cambio: independencia, secesión, división, fusión, cambio de nombre. **Sin geometría** | 1776 a hoy | **Dominio público y CC0**: «we waive copyright… through the CC0 1.0 Universal public domain dedication» (`LICENSE.md` de [HistoryAtState/gsh](https://github.com/HistoryAtState/gsh), leído 2026-11-14) | Sí | Verificada. Sirve para fechar y clasificar los cambios, no para dibujarlos |
| Historical National Boundaries (Univ. de Minnesota) | Instantáneas: 1800, 1914, 1918, 1939, 1945, 1970, 1990, 2000 | 1800–2000 | Sin licencia abierta explícita: «may be subject to additional license and use restrictions» ([DRUM](https://conservancy.umn.edu/handle/11299/227302)) | — | Descartada: solo instantáneas y licencia dudosa |
| `world-historical-gis-data` (npm) | Copia de los mapas de ThinkQuest (web escolar de 1996) | −2000 a 1994 | Licencia del paquete ISC, pero los datos no son suyos; su README avisa de «a spatial error of roughly +/- 40 miles» | — | Descartada: poco fiable |
| COW Territorial Change v6 | Cambios territoriales fechados | 1816 a 2018 | **Restringida**: «Users agree not to distribute the dataset to any third party without written permission» y «not to be used for any commercial activity» ([condiciones COW](https://correlatesofwar.org/?p=66), leído 2026-11-14) | **No** | Descartada sin permiso escrito |

**Cliopatria medida (2026-11-14, fichero `cliopatria_polities_only_v021.geojson`):**
- 13.797 filas: 13.412 de estado (`POLITY`) y 385 de relación (`RELATION`).
- 1.637 entidades, 13.792 filas con identificador de Wikidata.
- Cada fila dura una mediana de **8 años** (10 % de 2 años o menos; 90 % de 44 años o menos). Ejemplos:
  - El Imperio otomano tiene 132 formas distintas, y una empieza justo en 1453.
  - Roma tiene 55 formas.
- Detalle de la geometría: una mediana de 22 km entre vértices, parecida a historical-basemaps (13–20 km). No es más fina; lo que gana es la **resolución en el tiempo**.

Eso es justo lo que pide el creador para las guerras: ver la frontera cambiar fecha a fecha. Cliopatria lo da por años, no por días.

## Guerras y conflictos

| Fuente | Qué da | Cobertura | Licencia | ¿Al repo? | Estado |
|---|---|---|---|---|---|
| **UCDP** (Uppsala) | GED: cada episodio de violencia con fecha y su precisión (`date_prec` 1–5), lugar y su precisión (`where_prec` 1–7), muertes (mín./mejor/máx.). Conflict Termination: **inicio y fin** de cada conflicto y cómo acabó. ACD: conflictos por año | GED 1989–2025; ACD 1946–2025 | **CC BY 4.0**: «licensed under CC BY 4.0… free to use and redistribute them provided you cite the relevant publications» ([descargas UCDP](https://ucdp.uu.se/downloads/), leído 2026-11-14) | Sí, con cita | **Verificada**. Su API contesta 401 sin credenciales; no se piden claves (regla 5): se usan las descargas CSV |
| **HCED**, Historical Conflict Event Dataset (Miller 2022, [doi:10.7910/DVN/6ZFC0V](https://doi.org/10.7910/DVN/6ZFC0V), V3) | 6.951 batallas, asedios, revueltas y ataques, cada uno con coordenadas, año, participantes y resultado. Sale de la mayor enciclopedia de batallas, para corregir el sesgo occidental y moderno | −1468 a 2003 | **CC0 1.0**: la ficha original en Harvard Dataverse lo declara (`"license":{"name":"CC0 1.0"…}`, sonda 2026-11-14). La copia del [World Historical Gazetteer](https://whgazetteer.org/datasets/1415/places) dice lo mismo. La ficha marca `fileAccessRequest: true`: la descarga puede pedir un formulario | Sí | **Verificada**. Pendiente: descargar y medir. **La mejor candidata para batallas antiguas** |
| EventKG (L3S, v3.2, 22-12-2023) | Sucesos y relaciones de Wikidata, DBpedia, YAGO y listas de Wikipedia en 15 idiomas | — | **CC BY-SA 4.0** ([Zenodo](https://zenodo.org/records/10424118), leído 2026-11-14) | **No** («compartir igual»); sí para contrastar | Verificada |
| COW Inter-State War | Guerras entre estados con fechas | 1816–2007 | Las mismas condiciones restrictivas de COW | **No** | Descartada sin permiso |
| Wikidata | Inicio y fin (P580/P582), causa (P828), efecto (P1542), parte de (P361) | Toda la historia, desigual | CC0 | Sí | En uso (1.393 sucesos con intervalo) |

## Personas

| Fuente | Qué da | Cobertura | Licencia | ¿Al repo? | Estado |
|---|---|---|---|---|---|
| Wikidata | Nacimiento y muerte, lugares, ocupaciones | — | CC0 | Sí | En uso |
| **Base de personas notables** (Laouenan et al., *Scientific Data* 2022, [doi:10.1038/s41597-022-01369-4](https://doi.org/10.1038/s41597-022-01369-4)) | 2,2 millones de personas, contrastadas entre varias ediciones de Wikipedia y Wikidata | −3500 a 2018 | **CC BY-SA 4.0**: el `termsOfUse` del conjunto en Sciences Po enlaza a by-sa/4.0 y dice «All datasets included in this folder are subject to CC-BY-SA licensing» (sonda 2026-11-14). Datos: [doi:10.21410/7E4/YLG6YR](https://doi.org/10.21410/7E4/YLG6YR), versión 2 (3-4-2023) | **No** («compartir igual»). **Sí para contrastar** en Actions, publicando solo las discrepancias | Verificada |
| **GND** (Deutsche Nationalbibliothek, vía lobid) | Ficheros de autoridad: fechas de vida con fuente bibliotecaria | — | **CC0**: desde el 1-7-2015, «the authority data of the Integrated Authority File (GND)» se pueden reutilizar «under "Creative Commons Zero" (CC0 1.0) terms» ([nota de la DNB](https://www.dnb.de/EN/Ueber-uns/Presse/ArchivPM2015/metadatenCC0.html), leída 2026-11-14) | Sí | **Verificada**. La API de lobid responde (JSON, CORS `*`) |

## Lugares

| Fuente | Qué da | Licencia | ¿Al repo? | Estado |
|---|---|---|---|---|
| Pleiades | Lugares del mundo antiguo, con periodos | **CC BY 3.0**: «Sharing and remixing permitted under terms of the Creative Commons Attribution 3.0 License» ([versión 3.1](https://pleiades.stoa.org/news/blog/now-available-pleiades-datasets-3.1)). El aviso enlaza a la versión de EE. UU. de la licencia; el `LICENSE` de su repo de datos es «Attribution 3.0 Unported» | Sí | **Verificada** |
| GeoNames | 12 millones de lugares actuales | **CC BY 4.0**: «licensed under a Creative Commons Attribution 4.0 License» ([about](https://www.geonames.org/about.html)) | Sí | **Verificada** |
| World Historical Gazetteer | Lugares históricos enlazados | Su portada no dice licencia (sonda 2026-11-14) | — | Pendiente: buscar la licencia de cada colección |

## Sucesos naturales y astronómicos

| Fuente | Qué da | Licencia | ¿Al repo? | Estado |
|---|---|---|---|---|
| NOAA NCEI, terremotos significativos | Desde el 2150 a. C.; entra si hubo ≥ 10 muertos, daños moderados, M ≥ 7,5, intensidad ≥ X o tsunami. [doi:10.7289/V5TD9V7K](https://doi.org/10.7289/V5TD9V7K) | La página solo pide citar: «Please cite this data/database as doi: 10.7289/V5TD9V7K». No dice licencia. Es obra federal de EE. UU., que suele ser de dominio público, **sin comprobar** | — | **La API HazEL responde** con CORS `*`: fecha (desde −2150), lugar, coordenadas y magnitud (sonda 2026-11-14). Licencia pendiente |
| Smithsonian GVP, volcanes del Holoceno | Volcanes y erupciones con evidencia graduada. v5.3.6 (26-5-2026), [doi:10.5479/si.GVP.VOTW5-2025.5.3](https://doi.org/10.5479/si.GVP.VOTW5-2025.5.3) | La página no dice licencia; pide citar versión y fecha | — | Pendiente (contesta 403 a lectores automáticos) |
| NASA, eclipses (Espenak) | Eclipses de −1999 a 3000 | Su página de catálogo no dice licencia | — | Pendiente |
| Seshat | Variables de sociedades históricas | Su portada no dice licencia (sonda 2026-11-14) | — | Pendiente: buscar su página de licencia |

## Primer contraste: fronteras de la web frente a Cliopatria

**Qué se hace** (`scripts/cross-borders.js`, en `sources.yml` cada semana):
1. Se pone una rejilla de 0,5° sobre la tierra actual, sin la Antártida, con cada punto pesado por su área.
2. En cada año de mapa común (de −3000 a 2010) se mira qué entidad tiene cada punto en cada fuente.
3. No se emparejan nombres. Cada entidad se compara con la de la otra fuente con la que más tierra comparte.
4. Cada entidad cae en una clase:
   - **acuerdo**: se solapan en un 70 % o más (intersección / unión).
   - **más detallado**: una fuente parte en varias lo que la otra agrupa (colonias frente a «French Africa»).
   - **sin equivalente**: la otra fuente no pone nada ahí. Cliopatria solo tiene estados; historical-basemaps también dibuja pueblos sin estado, como «Inuit».
   - **desacuerdo**: todo lo demás.
5. Un desacuerdo **no dice cuál de las dos tiene razón**. Señala dónde hay que mirar.

**Resultado del 2026-11-14** (porcentaje de la tierra, según cómo la reparte historical-basemaps):

| Año | Acuerdo | Distinto detalle | Sin equivalente | **Desacuerdo** |
|---|---|---|---|---|
| 2000 | 97,3 % | 0,4 % | 0,2 % | 0 % |
| 1938 | 75,6 % | 22,0 % | 0 % | 0,2 % |
| 1920 | 62,2 % | 25,5 % | 3,6 % | 6,5 % |
| 1880 | 52,5 % | 13,4 % | 6,3 % | 12,5 % |
| 1715 | 23,5 % | 7,7 % | 24,2 % | 16,8 % |
| 1200 | 2,5 % | 9,6 % | 60,4 % | 13,6 % |
| −1000 | 0 % | 0,2 % | 94,2 % | 1,3 % |

Antes de unos −500, casi todo es «sin equivalente»: historical-basemaps dibuja culturas y pueblos, y Cliopatria aún no tiene estados ahí.

Ejemplos de desacuerdo que conviene mirar:
- **1920**: el 58 % del Paraguay de historical-basemaps cae en la Bolivia de Cliopatria. Es el Chaco, disputado entre ambos (la guerra del Chaco fue en 1932–35).
- **1200**: historical-basemaps dibuja el Sultanato de Delhi, fundado en 1206. Cliopatria pone ahí a los gúridas (solapamiento 0,07). Huele a anacronismo de la instantánea.
- **1880**: el 65 % del Canadá de historical-basemaps no tiene ninguna entidad en Cliopatria (el norte).

El informe completo, con 30 desacuerdos por año, está en la rama `sources` (`cross-borders.json`).

## Próximos contrastes (propuestos)

1. **Fechas de personas**: Wikidata frente a la GND (CC0, fuente bibliotecaria independiente) y frente a la base de personas notables (CC BY-SA: el contraste corre en Actions y solo publica las discrepancias). La discrepancia se marca en la ficha, sin corregir sola.
2. **Batallas**: nuestras batallas de Wikidata frente a HCED (año y lugar). La licencia ya está confirmada (CC0).
3. **Guerras**: inicio y fin en Wikidata frente a UCDP Conflict Termination (desde 1946).
4. **Fronteras recientes**: historical-basemaps frente a OpenHistoricalMap, donde OHM tenga cobertura.
