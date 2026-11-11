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
  El alcance decide qué se ve (umbral de importancia según el zoom, un marcador por celda: nada se satura) y
  **la ventana temporal es proporcional a la velocidad del tiempo**: parado se ven ±6 meses; con el tiempo corriendo, un suceso
  permanece unos 6 s *de pantalla* (como mucho 100 años de ventana), así que a 1 año/s se ven los de unos 5 años atrás, sin exigir
  día y hora. Los iconos son opacos (hasta 2026-11-11 se desvanecían en cuatro niveles según su antigüedad; ya no) y, cuanto más larga la ventana, más
  alto el umbral de importancia: a gran velocidad solo lo significativo. Al aparecer, cada icono entra con su gesto (las espadas se
  cruzan, el tanque avanza, el tratado se va escribiendo, la bandera se despliega…) en 1,1 s. Si la hora está documentada llega el aviso «dentro de 5 minutos…»,
  «acaba de…»; si solo se conoce el día, avisa al entrar en ese día («hora desconocida»). **Nunca se
  inventa una hora.** Hoy la semilla verificada tiene 5 sucesos con hora; la carga masiva desde Wikidata
  (CC0) se está construyendo en Actions.
- **Iconos de sucesos** (`map/event-icons.js`): cada suceso se dibuja con un icono de borde blanco que dice qué es, en lugar de un
  punto de color: espada, mosquete o tanque para guerras y batallas (según la época: antes de 1500, 1500–1913, desde 1914), pluma y
  papiro para tratados, anillos para alianzas y uniones, urna, trofeo, bandera, volcán, etc. El tipo sale de las clases de Wikidata
  del propio registro (cada QID de la tabla se contrasta con los datos en `npm run check:event-icons`); solo si el registro no trae
  clases se deduce del nombre. La época es una convención de dibujo, no un dato del suceso. Animación suave y sobria (flotar o sacudirse levemente y un
  anillo que respira) con **tres modos** en *Ajustes → Iconos y movimiento*: **Ahorro** (por defecto: un respiro de ~0,8 s cada ~7,8 s, el mapa descansa entre respiros; los saltos de tiempo van a ~25 fotogramas/s), **Completa** (movimiento continuo; si el equipo va justo, pasa sola a Ahorro y lo avisa) y **Apagada** (nada se mueve, los saltos son directos). «Reducir movimiento» del sistema arranca en Apagada que se puede apagar en *Ajustes* y que respeta «reducir movimiento» del sistema.
- **Ajustes y recuadros informativos** (botón *Ajustes*, `map/panels.js`): ocultar solos los recuadros informativos a los 2 s con
  fundido, en 3 niveles (solo la ficha del elemento seleccionado; además avisos y notas; además la ficha del cuerpo celeste), con
  *mostrar siempre* por recuadro. Con el cursor encima no se ocultan y las advertencias nunca se ocultan solas. Los recuadros se mueven
  arrastrando su asa (⠿, o con las flechas) y se ocultan con ×; `Ctrl+Z` deshace y `Ctrl+Mayús+Z` / `Ctrl+Y` rehace ocultar y
  mover (en pantallas táctiles hay botones de deshacer y rehacer). Todo se recuerda en la cookie de preferencias.
- **Tipos de suceso a tu gusto** (*Ajustes*): 14 grupos (guerras y batallas, tratados, alianzas y uniones, política, atentados, catástrofes,
  accidentes, nacimientos, muertes, obras, descubrimientos, deporte y ceremonias, extinciones, otros) que se marcan y desmarcan; vale para
  el mapa, el panel de sucesos y los avisos, se recuerda en la cookie (`et`) y no borra ningún dato.
- **Saltos de tiempo animados** (`map/glide.js`): una flecha con paso de 10 años, un botón de época o un año escrito no «aparece» en la
  fecha nueva: el reloj **barre** el tramo (1 h ≈ 0,45 s, 1 día ≈ 1 s, 10 años ≈ 2,3 s, 100 años ≈ 2,7 s). Los sucesos del tramo aparecen
  en orden cronológico (hacia atrás, al revés) y a distancias proporcionales a sus fechas (velocidad casi constante: arranque y frenada
  cortos); cada uno permanece el 40 % del recorrido, más transparente cuanto más antiguo, y al llegar la ventana se cierra poco a poco
  (los más antiguos se van primero). La luz día/noche no gira como una peonza: en tramos largos los días avanzan enteros y la hora se
  interpola por el camino corto. Con el reloj corriendo desde ~1 día/s no hay un aviso por día (se ven pasar en el mapa). Tramos de menos de 1 h o de más de 120 años, y la animación apagada, saltan directamente.

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
- **Más ayudas de uso (2026-11-11).** (1) En la vista del sistema solar se dibujan también las **órbitas de las lunas**: la de la
  Luna y las de Ío, Europa, Ganímedes y Calisto alrededor de Júpiter (periodos medidos con el propio motor de efemérides; el motor no
  da lunas de otros planetas). (2) Las órbitas tienen **grosor y opacidad según la profundidad**: el tramo cercano a la cámara, más
  grueso y opaco; el lejano, más fino y tenue (vista de frente, uniforme). (3) La velocidad del reloj y el paso de ← → admiten un
  **valor personalizado** («Personalizado…»: cantidad y unidad, con sentido en la velocidad), y **RePág/AvPág** tienen su propio paso
  (por defecto ×10 el de las flechas); el paso personalizado se recuerda en la cookie. (4) Se recuerda el **último elemento elegido**
  (país o suceso) y su ficha vuelve al entrar, sin mover la cámara. (5) Bajo el deslizador hay una **regla logarítmica** (marcas
  1–9 por cada potencia de diez de «hace X años»), que deja ver que la barra no es lineal. (6) Al pasar el ratón por un suceso, ese
  icono crece con un resplandor de su color y aparece su nombre en una etiqueta del mismo color: se sabe sobre qué caerá el clic.
  Un clic en un suceso **no mueve el mapa** (salvo con «Centrar al hacer clic», que ahora centra en el suceso y no en el punto del
  clic), y un temblor de la mano al hacer clic ya no arrastra el mapa.
- **Iconos de línea (2026-11-11).** Los iconos de sucesos son ahora de **línea de color muy intenso**, sin disco ni anillo
  alrededor: la línea va perfilada por un **borde negro** que sigue la silueta (se probó con filo exterior blanco y el creador eligió solo negro). Cada dibujo dice lo que es: espadas
  cruzadas (guerra antes de 1500), mosquetes cruzados (1500–1913), tanque (desde 1914), papiro y pluma (tratado), anillos (alianza o
  boda), bandera (política), urna (votación), estallido (atentado, violencia), volcán (desastre natural), señal de peligro (accidente),
  **cochecito de bebé (nacimiento; antes un brote, que no decía «persona que nace»)**, lápida sin símbolo religioso (muerte), libro
  abierto, notas musicales, lupa (descubrimiento), dinosaurio (extinción de especies), copa (deporte), medalla (premio), chincheta
  (suceso sin tipo) y calendario. El color va por familia y se distingue de lejos, cuando los iconos pasan a puntos, con el **brillo igualado** entre
  tipos (OKLCH, todos ≥ 5,5:1 frente al borde negro): rojo guerra, magenta
  violencia, naranja desastre natural, amarillo accidente, azules política y votaciones, verde tratados, rosa uniones, cian
  nacimientos, grafito muertes, morados obras, verde azulado descubrimientos, oro premios y deporte, pardo fósil extinciones y gris
  azulado lo genérico (`npm run check:event-icons` exige ≥ 60 de distancia RGB entre grupos). El anillo que respira solo rodea los puntos.
  Los iconos son **siempre opacos**: sin niveles de fundido por antigüedad ni atenuación por revisión (el estado de revisión se ve
  en la lista y en la ficha); un suceso que sale de la ventana desaparece en el acto.
- **Iconos según la distancia (2026-11-11).** Con la Tierra lejos los iconos de sucesos encogen (tamaño normal con zoom ≥ 3,2;
  80 % en la vista inicial; ~45 % a zoom 1,15) y, con la Tierra muy lejos (zoom < 1,15), pasan de golpe (sin transparencias) a **puntos de su color** (el del
  icono, con el matiz de la época) que conservan el anillo que respira. La zona de toque nunca baja de 7 px. Escala y fundido son
  funciones puras de `map/event-icons.js` (`zoomScale`, `iconShare`, `zoomScaled`, `iconFade`, `dotFade`) probadas en Node.
- **Maquetación sin solapes (2026-11-11).** Los recuadros ya no se colocan con coordenadas sueltas: viven en dos columnas en
  flujo (`#dock-l`: Sucesos, Cambios, Cielo, avisos; `#dock-r`: avisos flotantes, Ajustes, ficha del elemento, nota del fondo) entre
  la barra superior y la línea de tiempo, cuya altura mide el JS (`--top-h`, `--bot-h`). Se reparten el hueco y nunca bajan de un
  alto mínimo. Los botones se agrupan: a la vista *Sucesos* y *Cielo*; en *Capas ▾* fronteras, carreteras, centrar y estrellas;
  en *Más ▾* cambios, ajustes, idioma y tema (mismos ids y manejadores). En pantalla estrecha (≤ 760 px) las columnas pasan a una
  pila, solo hay una hoja abierta a la vez y la línea de tiempo se pliega (botón «⋯»); con puntero táctil los objetivos miden ≥ 44 px.
  Comprobado con Playwright en 1280×800, 1024×768, 768×1024, 390×844 y 844×390 (ningún par de recuadros se cruza, todo cabe).
- **Ambientación de época (2026-11-11).** El aspecto de toda la página cambia con la fecha del mapa, de modo que se sabe de un
  vistazo en qué época se está. Una **plantilla rellenable** (`map/eras.js`, pura y probada en Node) define 14 épocas (tiempo profundo,
  Paleolítico, Neolítico, Edad del Bronce, del Hierro, Antigüedad clásica, Alta Edad Media, Plena y Baja Edad Media, Renacimiento y
  Barroco, Ilustración, era industrial, siglo XX, era digital y futuro), y cada una rellena las mismas ranuras: paleta clara y oscura,
  tipografía (solo fuentes del sistema), forma de bordes y esquinas, adornos de esquina y filete bajo los títulos, trama de fondo,
  **cursor** del mapa (punta de sílex, hacha, lanza, pluma, espada, compás…), estilo de los **iconos de sucesos** (borde, disco y un
  matiz suave: cada icono sigue siendo reconocible pero se ve distinto en cada época) y colores del mapa. Una insignia bajo la fecha
  dice la época. *Ajustes → Ambientación de época* elige la intensidad: sin ella, sutil (colores y tipografía) o completa (por
  defecto). Los cambios de época seguidos (saltos largos, reloj rápido) se aplican como mucho cada 0,7 s y lo caro (mapa, sprites)
  espera a que se calmen. **Las edades son convenciones regionales (sobre todo eurasiáticas) y la insignia lo avisa**; es solo estética,
  nunca cambia datos. Para añadir una época o cambiar un look basta tocar `ERAS` en `map/eras.js`: las pruebas (`npm run check:eras`)
  exigen rangos contiguos, plantilla completa, contraste WCAG AA (texto y acento ≥ 4,5:1 en claro y oscuro), épocas vecinas
  claramente distintas, SVG sin recursos externos y variables CSS sin caracteres que rompan una declaración.
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
  - **Nombres**: con *Fronteras* activo, los del mapa político propio; con *Fronteras* apagado, solo accidentes
    geográficos (mares, bahías, estrechos, lagos, ríos, picos con su altitud e islas), nunca países ni ciudades.
    Los ríos con nombre solo existen en el mapa actual (en épocas anteriores se dibuja el cauce, sin nombre).
    OpenFreeMap no trae nombres de cordilleras, desiertos, cabos ni penínsulas.
  - **Carreteras**: capa aparte, apagada por defecto y solo visible en el mapa actual y de cerca (botón *Carreteras*;
    la preferencia se guarda en la cookie `ct_prefs`, campo `rd`). Incluye ferrocarril, caminos, sentidos, nombres y escudos.
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
