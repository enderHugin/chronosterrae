/* event-icons.js - Iconos de los sucesos: que icono corresponde a cada suceso, como se dibuja y como se anima.
 *
 * 1. classify(): suceso -> clave de icono. Se decide con lo que dice la FUENTE (clases de Wikidata P31 del registro, `classes`); solo si el
 *    registro no trae clases se deduce del nombre (como map/changes.js) y entonces `source` es 'name'. Todos los QID de ICON_CLASSES salen de
 *    los datos reales de data/events/ (scripts/check-event-icons.js comprueba que cada QID existe con esa etiqueta): ninguno de memoria.
 *    Las guerras y batallas llevan espada, mosquete o tanque segun la EPOCA del suceso (corte editorial, ver ERA_*): es una convencion de
 *    dibujo para distinguirlas de un vistazo, no una afirmacion sobre el armamento de ese conflicto concreto.
 * 2. GLYPHS: dibujos vectoriales (rutas SVG en una caja de 24x24). draw() los pinta con borde negro (HALO) sobre cualquier CanvasRenderingContext2D.
 * 3. createPulse(): metrónomo que alterna dos fases para la animacion (MapLibre interpola solo entre una fase y la otra: solo propiedades de
 *    pintura, baratas); con huecos de reposo para que el mapa llegue a `idle`.
 * Sin dependencias del DOM: se prueba en Node (rutas, clasificacion, reloj falso); el dibujo real se mira en el render (probe-shot).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./changes.js'));
    else root.ChronosEventIcons = factory(root.ChronosChanges);
})(typeof self !== 'undefined' ? self : this, function (Changes) {
    'use strict';

    const PRESENT = 1950;
    const ERA_MUSKET_FROM = 1500;     // < 1500: espada
    const ERA_TANK_FROM = 1914;       // >= 1914: tanque (entre medias: mosquete)

    /* ---------------------------- Clasificacion ---------------------------- */
    // QID -> [icono, etiqueta en los datos]. La etiqueta es la que trae el propio registro (se contrasta en las pruebas).
    const ICON_CLASSES = {
        // enlaces: bodas reales, alianzas, uniones
        Q1127126: ['union', 'military alliance'], Q1140229: ['union', 'political union'], Q63442071: ['union', 'royal wedding'], Q1093720: ['union', 'real union'], Q1747906: ['union', 'confederation'],
        // votaciones
        Q47566: ['election', 'United States presidential election'], Q890055: ['election', 'presidential election in France'], Q1333366: ['election', 'snap election'], Q1007356: ['election', 'German federal election'],
        Q22696407: ['election', 'Indian general election'], Q15283424: ['election', 'United Kingdom general election'], Q1219394: ['election', 'independence referendum'], Q4128699: ['election', 'Russian presidential election'],
        Q4128590: ['election', 'Ukrainian presidential election'], Q24659965: ['election', 'Israeli legislative election'], Q3587148: ['election', 'French legislative election'], Q43109: ['election', 'referendum'],
        Q1128324: ['election', 'European Parliament election'], Q76853179: ['election', 'group of elections'],
        // deporte
        Q27020041: ['sport', 'sports season'], Q26132862: ['sport', 'Olympic sports discipline event'], Q114609228: ['sport', 'recurring sporting event edition'], Q26213387: ['sport', 'Olympic delegation'],
        Q47345468: ['sport', 'tennis tournament edition'], Q53945096: ['sport', 'group during sports competition'], Q108861375: ['sport', 'Formula One season'], Q80716240: ['sport', 'UEFA Champions League final'],
        Q1478437: ['sport', 'association football competition'], Q3890208: ['sport', 'Olympic medal table'], Q167170: ['sport', 'multi-sport event'], Q17315159: ['sport', 'international association football match'],
        Q137592217: ['sport', 'Winter Olympic Games edition'], Q18536594: ['sport', 'Olympic sporting event'], Q178750: ['sport', 'Copa América'], Q109623729: ['sport', 'association football club match'],
        Q720609: ['sport', 'rowing at the Summer Olympics'], Q12708896: ['sport', 'final of the FIFA World Cup'],
        // ceremonias y premios
        Q16913666: ['ceremony', 'Academy Awards ceremony'], Q110288240: ['ceremony', 'Eurovision Song Contest edition'], Q115915867: ['ceremony', 'film award ceremony edition'], Q136819118: ['ceremony', 'television award ceremony edition'],
        Q110372546: ['ceremony', 'Junior Eurovision Song Contest edition'], Q4504495: ['ceremony', 'award ceremony'], Q27787439: ['ceremony', 'film festival edition'], Q130192067: ['ceremony', 'Olympic Games opening ceremony'],
        // accidentes
        Q744913: ['accident', 'aviation accident'], Q3002150: ['accident', 'aircraft crash'], Q1078765: ['accident', 'railway accident'], Q179057: ['accident', 'explosion'], Q7625093: ['accident', 'structure fire'],
        Q1331380: ['accident', 'derailment'], Q68800046: ['accident', 'industrial disaster'], Q171558: ['accident', 'accident'], Q1863435: ['accident', 'mid-air collision'], Q3193890: ['accident', 'environmental disaster'],
        Q977367: ['accident', 'chemical accident'], Q11396408: ['accident', 'train collision'],
        // entradas de calendario (el dato en si es un dia, un mes o una lista)
        Q47150325: ['calendar', 'calendar day of a given year'], Q47018478: ['calendar', 'calendar month of a given year'], Q13406463: ['calendar', 'Wikimedia list article'], Q18340514: ['calendar', 'events in a specific year or time period'],
        Q66010126: ['calendar', 'month starting on Tuesday'], Q66010148: ['calendar', 'month starting on Friday'], Q66010153: ['calendar', 'month starting on Saturday'], Q66010132: ['calendar', 'month starting on Wednesday'],
        Q66010158: ['calendar', 'month starting on Sunday'], Q66010139: ['calendar', 'month starting on Thursday'], Q66010119: ['calendar', 'month starting on Monday'], Q205892: ['calendar', 'calendar date'],
        // naturales (ademas de los que ya clasifica map/changes.js)
        Q8068: ['natural', 'flood'], Q8070: ['natural', 'tsunami'], Q747501: ['natural', 'Plinian eruption'], Q34439356: ['natural', 'hurricane'], Q7692360: ['natural', 'volcanic eruption'],
        Q113549847: ['natural', 'non-water flood'], Q727990: ['natural', 'megathrust earthquake'], Q114041309: ['natural', 'earthquake sequence'], Q44512: ['natural', 'epidemic'],
        Q2547976: ['natural', 'North Atlantic tropical cyclone'], Q2635501: ['natural', 'Kamchatka earthquake'],
        // violencia
        Q3882219: ['violence', 'assassination'], Q2380335: ['violence', 'airstrike'], Q41397: ['violence', 'genocide'], Q25917186: ['violence', 'coordinated terrorist attack'],
        // politica
        Q25906438: ['political', "attempted coup d'état"], Q1679887: ['political', 'student protest'], Q124757: ['political', 'riot'], Q13427116: ['political', 'peasant revolt'],
        Q1464916: ['political', 'declaration of independence'], Q263233: ['political', 'United States presidential inauguration'], Q464122: ['political', 'coronation of the British monarch'],
        // guerra (con epoca)
        Q21994376: ['war', 'war of independence'], Q1384277: ['war', 'military expedition']
    };
    // Clases de map/changes.js (CLASS_KINDS) -> icono. war/battle se resuelven por epoca.
    const CHANGE_KIND_ICON = { treaty: 'treaty', battle: 'war', war: 'war', political: 'political', natural: 'natural', violence: 'violence' };
    // Tipo de registro -> icono (los que no son «suceso»).
    const KIND_ICON = { birth: 'birth', death: 'death', publication: 'publication', composition: 'composition', discovery: 'discovery', extinction: 'extinction', event: 'event' };

    const eraIcon = (year) => (!Number.isFinite(year) || year < ERA_MUSKET_FROM ? 'sword' : year < ERA_TANK_FROM ? 'musket' : 'tank');
    const warLike = (icon) => icon === 'war';

    /**
     * @param p {kind, name, classes:[{id,label}], year}  year = año del suceso (negativo = a. C.)
     * @returns {{icon:string, source:'kind'|'wikidata'|'name'|'default'}}
     */
    function classify(p) {
        const kind = (p && p.kind) || 'event';
        if (kind !== 'event') return { icon: KIND_ICON[kind] || 'event', source: 'kind' };
        const year = p ? p.year : NaN; const classes = p && p.classes;
        const resolve = (icon) => (warLike(icon) ? eraIcon(year) : icon);
        if (Array.isArray(classes)) {
            for (const c of classes) {
                if (!c) continue;
                if (ICON_CLASSES[c.id]) return { icon: resolve(ICON_CLASSES[c.id][0]), source: 'wikidata' };
                if (Changes && Changes.CLASS_KINDS[c.id]) return { icon: resolve(CHANGE_KIND_ICON[Changes.CLASS_KINDS[c.id]]), source: 'wikidata' };
            }
            if (classes.length) return { icon: 'event', source: 'default' };   // la fuente lo clasifica y no es de los tipos con dibujo propio
        }
        if (Changes && p && typeof p.name === 'string') {
            const k = Changes.classify(p.name, null).kind;
            if (CHANGE_KIND_ICON[k]) return { icon: resolve(CHANGE_KIND_ICON[k]), source: 'name' };
        }
        return { icon: 'event', source: 'default' };
    }

    /* ---------------------------- Dibujos ---------------------------- */
    const r1 = (n) => Math.round(n * 100) / 100;
    /** Estrella de n puntas como ruta SVG. */
    function star(cx, cy, ro, ri, n, rot) {
        const pts = [];
        for (let i = 0; i < n * 2; i++) { const a = (rot === undefined ? -Math.PI / 2 : rot) + i * Math.PI / n; const r = i % 2 ? ri : ro; pts.push(r1(cx + r * Math.cos(a)) + ' ' + r1(cy + r * Math.sin(a))); }
        return 'M' + pts.join(' L') + ' Z';
    }
    const circle = (cx, cy, r) => 'M' + r1(cx - r) + ' ' + cy + ' a' + r + ' ' + r + ' 0 1 0 ' + r1(2 * r) + ' 0 a' + r + ' ' + r + ' 0 1 0 ' + r1(-2 * r) + ' 0 Z';
    const ellipse = (cx, cy, rx, ry) => 'M' + r1(cx - rx) + ' ' + cy + ' a' + rx + ' ' + ry + ' 0 1 0 ' + r1(2 * rx) + ' 0 a' + rx + ' ' + ry + ' 0 1 0 ' + r1(-2 * rx) + ' 0 Z';

    // Partes: t = 'f' relleno del color del icono, 'k' relleno oscuro, 'l' relleno claro, 's' trazo del color (w = grosor), 'd' trazo oscuro, 'c' trazo claro. r = giro en grados alrededor de (12,12).
    // ESTILO (2026-11-11, pedido del creador): linea gruesa de color intenso y forma facil de reconocer, sin circulo alrededor; el borde negro
    // sigue la silueta para que se lea sobre cualquier mapa. Cada dibujo dice lo que es: espadas, mosquete
    // humeante, tanque, papiro y pluma, anillos, bandera, urna, estallido, volcan, senal de peligro, cochecito de bebe (nacimiento), lapida,
    // libro abierto, notas musicales, lupa, dinosaurio (extincion), copa, medalla, chincheta (suceso) y calendario.
    const W = 2.05;                      // grosor del trazo principal (unidades de la caja 24x24); 2,5 al principio, algo mas fino a peticion del creador
    const SWORD = [
        { d: 'M12 1.8 V14.6', t: 's', w: W }, { d: 'M7.6 14.6 H16.4', t: 's', w: W }, { d: 'M12 14.6 V20', t: 's', w: W }, { d: circle(12, 21.6, 1.7), t: 'f' }
    ];
    const rot = (parts, r) => parts.map((p) => Object.assign({ r }, p));
    const MUSKET = [
        { d: 'M12 1.4 V13.8', t: 's', w: 1.64 }, { d: 'M10.4 13 H13.6 L15 21.6 C13.6 22.6 10.4 22.6 9 21.6 Z', t: 'f' }, { d: 'M13.6 15.6 C15.4 15.8 15.6 17.6 14.4 18.2', t: 's', w: 1.15 }
    ];
    const GLYPHS = {
        sword: rot(SWORD, -38).concat(rot(SWORD, 38)),
        // Mosquetes cruzados: canon largo y culata ancha (se distinguen de las espadas por la culata y la falta de guarda)
        musket: rot(MUSKET, -30).concat(rot(MUSKET, 30)),
        tank: [
            { d: 'M15 11.6 H22.6', t: 's', w: 1.8 }, { d: 'M7.6 14.8 V11 a1.4 1.4 0 0 1 1.4 -1.4 H13.6 a1.4 1.4 0 0 1 1.4 1.4 V14.8', t: 's', w: W },
            { d: 'M5.2 14.8 H18.8 a3 3 0 0 1 0 6 H5.2 a3 3 0 0 1 0 -6 Z', t: 's', w: W },
            { d: circle(7.4, 17.8, 1.1), t: 'f' }, { d: circle(12, 17.8, 1.1), t: 'f' }, { d: circle(16.6, 17.8, 1.1), t: 'f' }
        ],
        treaty: [
            { d: 'M6 4 H16.6 V18.4 H6 Z', t: 's', w: W }, { d: 'M4 18.6 H18.6', t: 's', w: W },
            { d: 'M8.6 8 H13.8', t: 's', w: 1.23 }, { d: 'M8.6 11 H13.8', t: 's', w: 1.23 }, { d: 'M8.6 14 H11.8', t: 's', w: 1.23 },
            { d: 'M22 1.8 C17 3.4 14.6 7.4 13.6 12.4 L15.2 11.8 C18.8 10 21 6.6 22 1.8 Z', t: 'f' }, { d: 'M13.6 12.4 L12 17', t: 's', w: 1.31 }
        ],
        union: [
            { d: circle(8.8, 12.6, 5.6), t: 's', w: W + 0.2 }, { d: circle(15.2, 12.6, 5.6), t: 's', w: W + 0.2 }
        ],
        political: [
            { d: 'M5.4 2.6 V21.8', t: 's', w: W }, { d: 'M5.4 3.6 H19.6 L16.2 8.4 L19.6 13.2 H5.4 Z', t: 'f' }
        ],
        natural: [
            { d: 'M1.8 21 L8.4 10.2 H15.6 L22.2 21 Z', t: 's', w: W }, { d: 'M12 8.4 V3.6 M8.8 7.6 L6.8 4.4 M15.2 7.6 L17.2 4.4', t: 's', w: 1.8 }
        ],
        violence: [{ d: star(12, 12, 10.4, 4.8, 8, -Math.PI / 2 + Math.PI / 16), t: 's', w: 1.8 }, { d: circle(12, 12, 2), t: 'f' }],
        election: [
            { d: 'M8.4 2.2 H15.6 V10.4 H8.4 Z', t: 's', w: 1.56 }, { d: 'M10.2 6.6 L11.6 8 L13.8 4.8', t: 's', w: 1.23 },
            { d: 'M3.6 11.4 H20.4 V21 H3.6 Z', t: 's', w: W }, { d: 'M8.4 14.6 H15.6', t: 's', w: 1.8 }
        ],
        sport: [
            { d: 'M7 3.4 H17 V8.6 a5 5 0 0 1 -10 0 Z', t: 's', w: W }, { d: 'M7 5.4 H4.4 a2.6 2.6 0 0 0 2.8 4.8', t: 's', w: 1.48 }, { d: 'M17 5.4 H19.6 a2.6 2.6 0 0 1 -2.8 4.8', t: 's', w: 1.48 },
            { d: 'M12 13.8 V18', t: 's', w: W }, { d: 'M7.6 20.4 H16.4', t: 's', w: W + 0.4 }
        ],
        ceremony: [
            { d: 'M7.4 1.8 L12 9.4 L16.6 1.8', t: 's', w: 1.8 }, { d: circle(12, 15.2, 5.6), t: 's', w: W }, { d: star(12, 15.2, 3.2, 1.35, 5), t: 'f' }
        ],
        accident: [{ d: 'M12 2.8 L22 20.4 H2 Z', t: 's', w: W }, { d: 'M12 9.4 V14', t: 's', w: 2.13 }, { d: circle(12, 17.2, 1.45), t: 'f' }],
        calendar: [
            { d: 'M3.6 5.4 H20.4 V20.8 H3.6 Z', t: 's', w: W }, { d: 'M3.6 9.6 H20.4', t: 's', w: 1.64 }, { d: 'M8 2.6 V7', t: 's', w: 1.8 }, { d: 'M16 2.6 V7', t: 's', w: 1.8 },
            { d: circle(8, 13.4, 1.1), t: 'f' }, { d: circle(12, 13.4, 1.1), t: 'f' }, { d: circle(16, 13.4, 1.1), t: 'f' }, { d: circle(8, 17.2, 1.1), t: 'f' }, { d: circle(12, 17.2, 1.1), t: 'f' }
        ],
        // Nacimiento: cochecito de bebe (capota, cuna, asa y ruedas). Antes era un brote: no decia «persona que nace».
        birth: [
            { d: 'M4.6 11.6 A7.2 7.2 0 0 1 11.8 4.4 V11.6 Z', t: 'f' },
            { d: 'M4.6 11.6 H19.4 C19.4 15 16.4 17 12 17 C7.6 17 4.6 15 4.6 11.6 Z', t: 's', w: W }, { d: 'M19.4 11.6 L21.6 7.2', t: 's', w: 1.8 },
            { d: circle(8, 20.2, 1.8), t: 's', w: 1.48 }, { d: circle(16, 20.2, 1.8), t: 's', w: 1.48 }
        ],
        // Muerte: lapida sobre el suelo (sin simbolo religioso)
        death: [
            { d: 'M6.2 20.6 V10.2 a5.8 5.8 0 0 1 11.6 0 V20.6', t: 's', w: W }, { d: 'M2.8 21 H21.2', t: 's', w: W }, { d: 'M9.6 12 H14.4 M9.6 15.4 H14.4', t: 's', w: 1.31 }
        ],
        publication: [
            { d: 'M12 6.4 C9.6 4.6 6 4.2 2.4 5.2 V19.2 C6 18.2 9.6 18.6 12 20.4', t: 's', w: W },
            { d: 'M12 6.4 C14.4 4.6 18 4.2 21.6 5.2 V19.2 C18 18.2 14.4 18.6 12 20.4', t: 's', w: W }, { d: 'M12 6.4 V20.4', t: 's', w: 1.64 }
        ],
        composition: [
            { d: 'M9 17.4 V6.4', t: 's', w: 1.8 }, { d: 'M19 15.4 V4.4', t: 's', w: 1.8 }, { d: 'M9 6.2 L19 4 V7.8 L9 10 Z', t: 'f' },
            { d: ellipse(6.4, 17.6, 3.2, 2.5), t: 'f' }, { d: ellipse(16.4, 15.6, 3.2, 2.5), t: 'f' }
        ],
        discovery: [{ d: circle(9.8, 9.8, 6.2), t: 's', w: W + 0.2 }, { d: 'M14.4 14.4 L21 21', t: 's', w: 2.95 }, { d: 'M7 8.6 a3.2 3.2 0 0 1 2.6 -2.2', t: 's', w: 1.15 }],
        // Extincion de especies: dinosaurio (saurópodo) de perfil
        extinction: [
            { d: 'M2 15.6 C5.4 15.6 6.6 11.8 10.6 11.8 H15 C16.6 11.8 17 9 17.4 6.2 C17.6 4.6 19 3.8 20.6 4.4 L21.6 5.6', t: 's', w: W },
            { d: 'M7.4 15.6 H16 C17.4 15.6 18 14 17.8 12', t: 's', w: 1.8 }, { d: 'M9.6 15.6 V20.4 M15 15.6 V20.4', t: 's', w: W }
        ],
        // Suceso sin tipo propio: chincheta de mapa
        event: [{ d: 'M12 21.6 C7.4 16 5.2 12.8 5.2 9.6 a6.8 6.8 0 0 1 13.6 0 C18.8 12.8 16.6 16 12 21.6 Z', t: 's', w: W }, { d: circle(12, 9.6, 2.3), t: 'f' }]
    };
    const KEYS = Object.keys(GLYPHS);

    /* ---------------------------- Papel de cada persona ----------------------------
     * Pedido del creador (2026-11-12): «iconos para entender visualmente y al instante quien es cada personaje: corona para rey, mitra para
     * papa, libreta y pluma para escritor, libreta y pluma con pentagramas para compositor, etc.». El nacimiento y la muerte de una persona con
     * papel conocido (data/people/roles.json, scripts/build-roles.js: ocupacion/cargo de Wikidata) se dibujan con el dibujo de su papel en el
     * COLOR de siempre (cian nace, gris muere): la forma dice quien es; el color, que pasa. Sin papel, el cochecito o la lapida de siempre.
     * Clave de dibujo compuesta: 'birth.monarch', 'death.writer'... (el icono, el grupo del filtro y el color siguen siendo 'birth'/'death').
     */
    const notebook = [   // libreta de espiral con pluma (escritor y compositor la comparten; cambia lo que hay escrito)
        { d: 'M5.8 3.6 H16 V21 H5.8 Z', t: 's', w: W }, { d: 'M3.6 6.8 H7.8 M3.6 10.6 H7.8 M3.6 14.4 H7.8 M3.6 18.2 H7.8', t: 's', w: 1.31 }
    ];
    const quill = [{ d: 'M22.4 2 C17.8 3.6 15.6 7.6 14.8 12.4 L16.4 11.8 C19.8 10 21.6 6.8 22.4 2 Z', t: 'f' }, { d: 'M14.8 12.4 L13.4 16.8', t: 's', w: 1.31 }];
    const ROLE_GLYPHS = {
        // corona: tres puntas con perla y aro
        monarch: [
            { d: 'M4.4 17.8 L3.4 8.2 L8.3 11.8 L12 5.2 L15.7 11.8 L20.6 8.2 L19.6 17.8 Z', t: 's', w: W }, { d: 'M4.4 21.2 H19.6', t: 's', w: W },
            { d: circle(3.4, 6.4, 1.45), t: 'f' }, { d: circle(12, 3.4, 1.45), t: 'f' }, { d: circle(20.6, 6.4, 1.45), t: 'f' }
        ],
        // mitra: sombrero apuntado con la hendidura arriba, cinta ancha abajo, galon vertical y las dos infulas que cuelgan
        pope: [
            { d: 'M6 19.6 L4.8 9.6 L10.6 3 L12 5.4 L13.4 3 L19.2 9.6 L18 19.6 Z', t: 's', w: W },
            { d: 'M6 15.8 H18 V19.6 H6 Z', t: 'f' }, { d: 'M12 8 V15.8', t: 's', w: 1.64 }, { d: 'M8.8 19.8 L8 22.8 M15.2 19.8 L16 22.8', t: 's', w: 1.64 }
        ],
        // libreta y pluma, con renglones
        writer: notebook.concat([{ d: 'M8.6 8 H12.8 M8.6 11.4 H12.4 M8.6 14.8 H11.6', t: 's', w: 1.31 }], quill),
        // libreta y pluma, con pentagrama y una corchea
        composer: notebook.concat([{ d: 'M8.2 7 H13.6 M8.2 9.6 H13.6 M8.2 12.2 H13.6', t: 's', w: 1.1 }, { d: 'M11.4 17.4 V8.4 C12.4 9.8 14.2 10.4 14.2 12.8', t: 's', w: 1.48 }, { d: ellipse(9.6, 17.6, 2.4, 1.9), t: 'f' }], quill),
        // paleta con agujero para el pulgar y cuatro colores
        painter: [
            { d: 'M12 3 C6.6 3 2.6 6.8 2.6 11.6 C2.6 16.4 6.4 20.6 11.2 20.6 C13 20.6 13.6 19.2 13.2 17.8 C12.8 16.2 13.8 15 15.4 15 H17.6 C19.8 15 21.4 13.4 21.4 11 C21.4 6.4 17.2 3 12 3 Z', t: 's', w: W },
            { d: circle(7.2, 9.6, 1.55), t: 'f' }, { d: circle(11.6, 7, 1.55), t: 'f' }, { d: circle(16.4, 8.6, 1.55), t: 'f' }, { d: circle(7.2, 14.6, 1.55), t: 'f' }
        ],
        // matraz con liquido
        scientist: [
            { d: 'M9.4 2.8 H14.6', t: 's', w: W },
            { d: 'M10.4 3 V9.4 L4.6 19 C3.8 20.4 4.6 21.4 6 21.4 H18 C19.4 21.4 20.2 20.4 19.4 19 L13.6 9.4 V3', t: 's', w: W },
            { d: 'M7.4 15.4 H16.6 L18.2 18.4 C18.6 19.2 18.2 19.8 17.4 19.8 H6.6 C5.8 19.8 5.4 19.2 5.8 18.4 Z', t: 'f' }
        ],
        // bocadillo de pensamiento
        philosopher: [{ d: ellipse(13.6, 9, 8, 5.8), t: 's', w: W }, { d: circle(6, 17.4, 1.9), t: 'f' }, { d: circle(3.2, 20.8, 1.2), t: 'f' }],
        // vela encendida (devocion; sin simbolo de una religion concreta)
        religious: [
            { d: 'M12 1.8 C14.4 4.4 14.8 6.6 12 8.6 C9.2 6.6 9.6 4.4 12 1.8 Z', t: 'f' }, { d: 'M9.2 11 H14.8 V20.8 H9.2 Z', t: 's', w: W }, { d: 'M5.4 21.2 H18.6', t: 's', w: W }
        ],
        // rosa de los vientos
        explorer: [{ d: circle(12, 12, 7.2), t: 's', w: 1.48 }, { d: star(12, 12, 10.6, 2.7, 4), t: 'f' }],
        // compas de dibujo
        architect: [
            { d: circle(12, 4, 1.9), t: 's', w: 1.48 }, { d: 'M10.9 5.8 L5.6 21.2', t: 's', w: W }, { d: 'M13.1 5.8 L18.4 21.2', t: 's', w: W },
            { d: 'M7.6 15.4 C10.4 16.8 13.6 16.8 16.4 15.4', t: 's', w: 1.48 }
        ],
        // bombilla
        inventor: [
            { d: 'M9 16.2 C6.6 14.6 5.2 12.2 5.2 9.6 A6.8 6.8 0 0 1 18.8 9.6 C18.8 12.2 17.4 14.6 15 16.2 Z', t: 's', w: W },
            { d: 'M10.2 12.6 L12 10.2 L13.8 12.6', t: 's', w: 1.23 }, { d: 'M9.4 19 H14.6', t: 's', w: 1.8 }, { d: 'M10.6 21.6 H13.4', t: 's', w: 1.8 }
        ],
        // galones con estrella
        military: [{ d: star(12, 5.4, 4.4, 1.85, 5), t: 'f' }, { d: 'M4.2 14.2 L12 10.2 L19.8 14.2', t: 's', w: W + 0.2 }, { d: 'M4.2 20 L12 16 L19.8 20', t: 's', w: W + 0.2 }],
        // orador tras un atril (discurso)
        politician: [
            { d: circle(12, 4.6, 2.6), t: 'f' }, { d: 'M6.4 12 C6.4 8.4 17.6 8.4 17.6 12', t: 's', w: W },
            { d: 'M4.2 12.4 H19.8', t: 's', w: W + 0.2 }, { d: 'M7.2 12.6 L8.6 21.2 H15.4 L16.8 12.6', t: 's', w: W }
        ],
        // claqueta (cine y teatro)
        actor: [
            { d: 'M3.4 10.2 H20.6 V20.6 H3.4 Z', t: 's', w: W }, { d: 'M3.6 9.6 L19.6 4.4', t: 's', w: W },
            { d: 'M8.4 10.4 L7 13.8 M13.4 10.4 L12 13.8 M18.4 10.4 L17 13.8', t: 's', w: 1.31 }, { d: 'M3.4 13.8 H20.6', t: 's', w: 1.31 }
        ],
        // microfono de pie (interpretacion musical)
        musician: [
            { d: 'M9.2 4.8 A2.8 2.8 0 0 1 14.8 4.8 V11 A2.8 2.8 0 0 1 9.2 11 Z', t: 's', w: W },
            { d: 'M6.2 10.4 C6.2 14 8.8 16.2 12 16.2 C15.2 16.2 17.8 14 17.8 10.4', t: 's', w: 1.64 }, { d: 'M12 16.2 V20.6', t: 's', w: 1.64 }, { d: 'M8.4 21.2 H15.6', t: 's', w: W }
        ],
        // corredor
        athlete: [
            { d: circle(15.6, 3.8, 2.2), t: 'f' }, { d: 'M14 7.6 L11 13.4', t: 's', w: W + 0.2 }, { d: 'M7.4 10.2 L10 7.8 L14 7.6 L16.4 10.8 L19.2 11.4', t: 's', w: 1.64 },
            { d: 'M11 13.4 L15 16 L13.8 21.4', t: 's', w: W }, { d: 'M11 13.4 L8.6 17.4 L4.2 18.2', t: 's', w: W }
        ]
    };
    // Orden: el de la leyenda. Nombres neutros (ambito, no profesion con genero): «Ámbito: Realeza».
    const ROLES = [
        { id: 'monarch', es: 'Realeza', en: 'Royalty' }, { id: 'pope', es: 'Papado', en: 'Papacy' }, { id: 'religious', es: 'Religión', en: 'Religion' },
        { id: 'politician', es: 'Política', en: 'Politics' }, { id: 'military', es: 'Milicia', en: 'Military' }, { id: 'explorer', es: 'Exploración', en: 'Exploration' },
        { id: 'writer', es: 'Literatura', en: 'Literature' }, { id: 'composer', es: 'Composición musical', en: 'Musical composition' }, { id: 'musician', es: 'Interpretación musical', en: 'Music performance' },
        { id: 'painter', es: 'Pintura y escultura', en: 'Painting and sculpture' }, { id: 'architect', es: 'Arquitectura', en: 'Architecture' }, { id: 'actor', es: 'Cine y teatro', en: 'Film and theatre' },
        { id: 'philosopher', es: 'Filosofía', en: 'Philosophy' }, { id: 'scientist', es: 'Ciencia', en: 'Science' }, { id: 'inventor', es: 'Invención e ingeniería', en: 'Invention and engineering' },
        { id: 'athlete', es: 'Deporte', en: 'Sport' }
    ];
    const ROLE_IDS = ROLES.map((r) => r.id);
    const PERSON_ICONS = ['birth', 'death'];
    /** Clave de dibujo de un suceso: el icono, o 'birth.monarch' si es una persona con papel conocido. */
    const drawKey = (icon, role) => (role && ROLE_GLYPHS[role] && PERSON_ICONS.indexOf(icon) >= 0 ? icon + '.' + role : icon);
    const splitKey = (key) => { const s = String(key || ''); const i = s.indexOf('.'); return i < 0 ? { icon: s, role: null } : { icon: s.slice(0, i), role: s.slice(i + 1) }; };
    /** Partes del dibujo de una clave (simple o compuesta); null si no existe. */
    const glyphOf = (key) => { const k = splitKey(key); if (!k.role) return GLYPHS[k.icon] || null; return PERSON_ICONS.indexOf(k.icon) >= 0 && ROLE_GLYPHS[k.role] ? ROLE_GLYPHS[k.role] : null; };
    const hasGlyph = (key) => !!glyphOf(key);
    /** Todas las claves de dibujo de personas con papel ('birth.monarch', 'death.monarch', ...). */
    const ROLE_KEYS = [].concat(...PERSON_ICONS.map((ic) => ROLE_IDS.map((r) => ic + '.' + r)));

    // Color del icono: intenso y por FAMILIA, para que de lejos (puntos de color) tambien se distinga el tipo. Rojo guerra, magenta violencia,
    // naranja desastre natural, amarillo peligro (accidente), azules politica y votaciones, verde tratados (paz), rosa uniones y bodas,
    // cian nacimientos, gris muertes, morados obras, verde azulado descubrimientos, oro premios y deporte, pardo fosil extinciones, gris
    // azulado claro lo generico. Brillo IGUALADO (2026-11-11, pedido del creador: que no haya tipos apagados junto a otros brillantes):
    // elegidos en OKLCH con luminosidad 0,65-0,86 y el maximo croma que cabe, asi todos contrastan con el borde negro (>= 5,5:1).
    // scripts/check-event-icons.js comprueba ese contraste, que el brillo no se dispare entre tipos y que cada grupo se distinga de los demas.
    const COLORS = {
        sword: '#fe353d', musket: '#fe353d', tank: '#fe353d', violence: '#f43bce', natural: '#ff963d', accident: '#edd207',
        political: '#5c9eff', election: '#7099ff', treaty: '#33d34b', union: '#ff9cb3',
        birth: '#25d1ff', death: '#9399a2', publication: '#bb78fe', composition: '#dd6bff', discovery: '#0fd4b7',
        sport: '#c59707', ceremony: '#c59707', extinction: '#c78858', event: '#a6cae0', calendar: '#a6cae0'
    };
    // Grupo de animacion: 'shake' = sacudida horizontal (conflicto, desastre); 'bob' = flotar vertical (el resto).
    const SHAKE = new Set(['sword', 'musket', 'tank', 'violence', 'political', 'natural', 'accident']);
    const animGroup = (icon) => (SHAKE.has(icon) ? 'shake' : 'bob');

    const BORDER = 2.6;                // grosor del borde (unidades de la caja 24x24; se ve la mitad por fuera)
    const HALO = '#000000';            // color del borde: negro (2026-11-11, prueba pedida por el creador; antes blanco)...
    const OUTER = null;                // sin filo exterior: solo negro (decision del creador tras probar el filo blanco). Con `outer` en las opciones se puede añadir uno
    const OUTER_W = 0.9;               // grosor del filo exterior opcional a cada lado (unidades de la caja)
    const shade = (hex, k) => {        // oscurece (k<0) o aclara (k>0) un #rrggbb
        const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
        return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
    };

    const HEX6 = /^#[0-9a-fA-F]{6}$/;
    const hexOr = (h, d) => (typeof h === 'string' && HEX6.test(h) ? h : d);
    const mixHex = (a, b, t) => {      // mezcla a (1-t) con b (t); ambos #rrggbb
        const x = parseInt(a.slice(1), 16), y = parseInt(hexOr(b, a).slice(1), 16); const m = (sh) => Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t);
        return '#' + [m(16), m(8), m(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
    };

    /* ---------------------------- Entrada animada ---------------------------- */
    // Al aparecer, cada icono hace un gesto corto y sobrio que dice lo que es (≈1 s, aceleracion suave, sin rebotes ni efectos): dos espadas que
    // se cruzan, una lapida que emerge de la tierra, un tanque que entra rodando, una pluma que escribe, dos anillos que se juntan, un cochecito
    // que llega rodando, una medalla que se cuelga, un mosquete que echa humo... El resultado se pre-dibuja en ENTER_FRAMES fotogramas por icono (t de 0 a 1); el ultimo es identico al sprite estatico.
    const ENTER_FRAMES = 10;
    const ENTER_MS = 1100;
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
    const sub = (e, a, b) => clamp01((e - a) / (b - a));                    // tramo [a,b] de la entrada, de 0 a 1
    const settle = (t) => { const x = clamp01(t) - 1; return 1 + 2.2 * x * x * x + 1.2 * x * x; };   // llega con un asentamiento minimo (≈4 %)
    // Transformacion por parte: dx, dy (unidades de la caja 24x24), rot (grados, ADICIONAL a la propia del dibujo), sx, sy, a (opacidad), pv (pivote), clip (y del suelo)
    const ENTER = {
        sword: (e, i) => { const k = settle(e); return { rot: (i < 4 ? -44 : 44) * (1 - k), a: sub(e, 0, 0.35) }; },
        musket: (e, i) => ({ rot: (i < 3 ? -40 : 40) * (1 - e), a: sub(e, 0, 0.35) }),                                                     // los mosquetes se cruzan
        tank: (e) => ({ dx: -16 * (1 - e), a: sub(e, 0, 0.35) }),
        treaty: (e, i) => {
            if (i <= 1) return { a: sub(e, 0, 0.3) };
            if (i <= 4) { const k = i - 2; return { sx: sub(e, 0.3 + 0.17 * k, 0.55 + 0.17 * k), pv: [8.6, 12], a: sub(e, 0.25, 0.4) }; }   // las lineas se van escribiendo
            return { dx: 5 * (1 - e), dy: -4 * (1 - e), a: sub(e, 0.1, 0.4) };                                                              // la pluma llega escribiendo
        },
        union: (e, i) => ({ dx: (i === 0 ? -6 : 6) * (1 - e), a: sub(e, 0, 0.4) }),
        political: (e, i) => (i === 0 ? { a: sub(e, 0, 0.3) } : { sx: sub(e, 0.15, 1), pv: [5.5, 8], a: sub(e, 0.1, 0.3) }),   // la bandera se despliega
        natural: (e, i) => (i === 0 ? { dy: 4 * (1 - e), a: sub(e, 0, 0.5) } : { sy: sub(e, 0.4, 1), pv: [12, 8.4], a: sub(e, 0.4, 0.6) }),
        violence: (e) => { const k = lerp(0.3, 1, settle(e)); return { sx: k, sy: k, a: sub(e, 0, 0.3) }; },
        election: (e, i) => (i <= 1 ? { dy: -6 * (1 - e), a: sub(e, 0, 0.5) } : { a: sub(e, 0, 0.3) }),   // la papeleta baja a la urna
        sport: (e) => ({ dy: 6 * (1 - e), a: sub(e, 0, 0.4) }),
        ceremony: (e) => ({ rot: -32 * (1 - e), pv: [12, 1.8], a: sub(e, 0, 0.35) }),                                             // la medalla se cuelga y oscila
        accident: (e) => { const k = lerp(0.55, 1, e); return { sx: k, sy: k, pv: [12, 20.5], a: sub(e, 0, 0.4) }; },
        calendar: (e, i) => (i < 4 ? { dy: 4 * (1 - e), a: sub(e, 0, 0.35) } : { a: sub(e, 0.45 + 0.08 * (i - 4), 0.75 + 0.08 * (i - 4)) }),
        birth: (e) => ({ dx: -9 * (1 - e), a: sub(e, 0, 0.35) }),                                                                           // el cochecito llega rodando
        death: (e, i) => (i === 1 ? { a: sub(e, 0, 0.3) } : { dy: 16 * (1 - e), clip: 21 }),                                               // la lapida emerge de la tierra (el suelo ya esta)
        publication: (e) => ({ sx: sub(e, 0, 1), pv: [12, 12], a: sub(e, 0, 0.3) }),                                                        // el libro se abre
        composition: (e) => ({ dy: 6 * (1 - e), a: sub(e, 0, 0.5) }),
        discovery: (e) => ({ rot: -35 * (1 - e), pv: [20, 20], a: sub(e, 0, 0.4) }),
        extinction: (e) => { const k = lerp(0.8, 1, e); return { sx: k, sy: k, a: sub(e, 0, 0.6) }; },
        event: (e) => ({ dy: -7 * (1 - e), a: sub(e, 0, 0.4) })                                                                    // la chincheta se clava
    };
    // Personas con papel: nace -> el dibujo sube y crece un poco al aparecer; muere -> baja despacio hasta su sitio (como quien se posa)
    const ENTER_ROLE = {
        birth: (e) => { const k = lerp(0.7, 1, settle(e)); return { dy: 5 * (1 - e), sx: k, sy: k, pv: [12, 21], a: sub(e, 0, 0.4) }; },
        death: (e) => ({ dy: -5 * (1 - e), a: sub(e, 0, 0.55) })
    };
    const IDENT = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, a: 1, pv: [12, 12], clip: null };
    /** Transformacion de la parte `i` del icono `key` en el instante t (0..1) de su entrada. En t >= 1 es la identidad. */
    function enterParams(key, t, i) {
        if (!(t < 1)) return Object.assign({}, IDENT);
        const sk = splitKey(key); const f = sk.role ? ENTER_ROLE[sk.icon] : ENTER[key]; if (!f) return Object.assign({}, IDENT);
        return Object.assign({}, IDENT, f(easeOut(Number.isFinite(t) ? t : 0), i));
    }
    const isIdent = (tr) => tr.dx === 0 && tr.dy === 0 && tr.rot === 0 && tr.sx === 1 && tr.sy === 1 && tr.a === 1 && tr.clip === null;

    /**
     * Dibuja el icono `key` en un cuadrado de `size` px (esquina superior izquierda en (x,y)): primero el borde (negro, HALO) de toda la silueta y encima
     * el relleno. Opciones: `Path2D` y `color` (por defecto, el global y el color del icono) y `t` (0..1, instante de la entrada animada; sin él,
     * el dibujo final) y `parts` (un dibujo ajeno, p. ej. las construcciones, que comparte borde y trazo con los sucesos).
     */
    function draw(ctx, key, size, o) {
        const parts = (o && o.parts) || glyphOf(key); if (!parts) throw new Error('icono desconocido: ' + key);   // o.parts: dibujo de otra capa (map/built.js) con el mismo estilo
        const P2D = (o && o.Path2D) || (typeof Path2D !== 'undefined' ? Path2D : null); if (!P2D) throw new Error('falta Path2D');
        const tint = o && o.tint && o.tint.amt > 0 ? o.tint : null;      // matiz de la epoca (ChronosEras): mezcla suave, el icono sigue siendo reconocible
        const base = COLORS[splitKey(key).icon] || COLORS.event;   // 'birth.monarch' lleva el color de 'birth'
        const color = (o && o.color) || (tint ? mixHex(base, tint.color, Math.min(tint.amt, 0.35)) : base); const dark = shade(color, -0.4);
        const light = hexOr(o && o.halo, HALO);               // borde que sigue la silueta (negro por defecto; `halo` lo cambia)
        const outer = o && o.outer ? hexOr(o.outer, null) : OUTER;   // filo exterior opcional (por defecto ninguno)
        const bw0 = o && typeof o.border === 'number' ? o.border : BORDER;   // grosor del borde (las construcciones lo llevan mas fino)
        const x = (o && o.x) || 0; const y = (o && o.y) || 0; const k = size / 24;
        const t = o && o.t !== undefined ? o.t : 1;
        const trs = parts.map((p, i) => enterParams(key, t, i));
        const place = (p, tr) => {
            ctx.translate(x, y); ctx.scale(k, k);
            if (tr.clip !== null) { ctx.beginPath(); ctx.rect(-5, -5, 34, tr.clip + 5); ctx.clip(); }
            if (!isIdent(tr)) { ctx.translate(tr.dx, tr.dy); ctx.translate(tr.pv[0], tr.pv[1]); ctx.rotate(tr.rot * Math.PI / 180); ctx.scale(tr.sx, tr.sy); ctx.translate(-tr.pv[0], -tr.pv[1]); }
            if (p.r) { ctx.translate(12, 12); ctx.rotate(p.r * Math.PI / 180); ctx.translate(-12, -12); }
        };
        ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        // 1. borde negro (HALO) de toda la silueta; si se pide, debajo un filo exterior (`outer`, mas ancho)
        [[outer, bw0 + 2 * OUTER_W], [light, bw0]].filter(([col]) => col).forEach(([col, bw]) => parts.forEach((p, i) => {
            const tr = trs[i]; if (p.t === 'l' || p.t === 'c' || tr.a <= 0 || tr.sx === 0 || tr.sy === 0) return;
            ctx.save(); place(p, tr); ctx.globalAlpha = tr.a; ctx.strokeStyle = col; ctx.lineWidth = bw + ((p.t === 's' || p.t === 'd') ? (p.w || 2) : 0); ctx.stroke(new P2D(p.d)); ctx.restore();
        }));
        parts.forEach((p, i) => {                                  // 2. relleno y trazos
            const tr = trs[i]; if (tr.a <= 0 || tr.sx === 0 || tr.sy === 0) return;
            ctx.save(); place(p, tr); ctx.globalAlpha = tr.a;
            const path = new P2D(p.d);
            if (p.t === 'f' || p.t === 'k' || p.t === 'l') { ctx.fillStyle = p.t === 'f' ? color : p.t === 'k' ? dark : light; ctx.fill(path); }
            else { ctx.strokeStyle = p.t === 's' ? color : p.t === 'd' ? dark : light; ctx.lineWidth = p.w || 2; ctx.stroke(path); }
            ctx.restore();
        });
        ctx.restore();
    }

    /* ---------------------------- Analisis de rutas (para las pruebas) ---------------------------- */
    const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, A: 7, Z: 0 };
    /** Caja que contiene los puntos de la ruta (extremos y puntos de control; los arcos, por sus extremos). Lanza error si la ruta esta mal formada. */
    function pathBox(d) {
        if (typeof d !== 'string' || /[^MmLlHhVvCcAaZz0-9eE.,\s-]/.test(d)) throw new Error('caracteres o comandos no admitidos en la ruta: ' + d);
        const toks = d.match(/[MmLlHhVvCcAaZz]|-?\d*\.?\d+(?:e-?\d+)?/g);
        if (!toks) throw new Error('ruta vacia');
        let i = 0; let cx = 0; let cy = 0; let sx = 0; let sy = 0; let cmd = null;
        const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        const add = (x, y) => { box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x); box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y); };
        const num = () => { const v = parseFloat(toks[i++]); if (!Number.isFinite(v)) throw new Error('numero esperado en ' + d); return v; };
        if (!/^[Mm]$/.test(toks[0])) throw new Error('la ruta debe empezar por M: ' + d);
        while (i < toks.length) {
            if (/^[A-Za-z]$/.test(toks[i])) cmd = toks[i++];
            else if (cmd === null || /^[Zz]$/.test(cmd)) throw new Error('numeros sueltos en ' + d);
            const up = cmd.toUpperCase(); const rel = cmd !== up;
            if (!(up in ARGS)) throw new Error('comando no admitido ' + cmd);
            if (up === 'Z') { cx = sx; cy = sy; continue; }
            const a = []; for (let n = 0; n < ARGS[up]; n++) a.push(num());
            if (up === 'M' || up === 'L') { cx = rel ? cx + a[0] : a[0]; cy = rel ? cy + a[1] : a[1]; add(cx, cy); if (up === 'M') { sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; } }
            else if (up === 'H') { cx = rel ? cx + a[0] : a[0]; add(cx, cy); }
            else if (up === 'V') { cy = rel ? cy + a[0] : a[0]; add(cx, cy); }
            else if (up === 'C') { add(rel ? cx + a[0] : a[0], rel ? cy + a[1] : a[1]); add(rel ? cx + a[2] : a[2], rel ? cy + a[3] : a[3]); cx = rel ? cx + a[4] : a[4]; cy = rel ? cy + a[5] : a[5]; add(cx, cy); }
            else if (up === 'A') {
                if (a[3] !== 0 && a[3] !== 1) throw new Error('bandera de arco invalida en ' + d); if (a[4] !== 0 && a[4] !== 1) throw new Error('bandera de arco invalida en ' + d);
                cx = rel ? cx + a[5] : a[5]; cy = rel ? cy + a[6] : a[6]; add(cx, cy);
            }
        }
        return box;
    }

    /* ---------------------------- Animacion ---------------------------- */
    /**
     * Alterna la fase (0/1) cada `period` ms mientras `enabled()` sea verdadero. El consumidor aplica la fase con una transicion MÁS CORTA que el
     * periodo (el resto es reposo, y deja que el mapa llegue a `idle`). Reloj inyectado: setTimer/clearTimer.
     */
    function createPulse(o) {
        let period = (o && o.period) || 1500; let rest = (o && o.rest) || 0; const apply = (o && o.apply) || (() => {}); const enabled = (o && o.enabled) || (() => true);
        const setT = (o && o.setTimer) || ((fn, ms) => setTimeout(fn, ms)); const clearT = (o && o.clearTimer) || ((h) => clearTimeout(h));
        let timer = null; let phase = 0; let running = false;
        // Con `rest` > 0 el pulso es un RESPIRO: sube, aguanta `period` ms, baja y descansa `rest` ms (el mapa no se repinta mientras descansa).
        const delay = () => (rest > 0 && phase === 0 ? rest : period);
        function tick() {
            timer = null; if (!running) return;
            if (enabled()) { phase = phase ? 0 : 1; apply(phase); }
            timer = setT(tick, delay());
        }
        return {
            get period() { return period; }, get rest() { return rest; },
            start() { if (running) return false; running = true; timer = setT(tick, delay()); return true; },
            stop() { running = false; if (timer !== null) { clearT(timer); timer = null; } if (phase !== 0) { phase = 0; apply(0); } },
            /** Cambia el ritmo en marcha (p. ej. de «completa» a «ahorro»): la fase vuelve a reposo y se reprograma. */
            configure(c) {
                if (c && c.period > 0) period = c.period; if (c && c.rest >= 0) rest = c.rest;
                if (!running) return;
                if (timer !== null) { clearT(timer); timer = null; } if (phase !== 0) { phase = 0; apply(0); }
                timer = setT(tick, delay());
            },
            running: () => running, phase: () => phase
        };
    }

    /**
     * ¿Va justo el equipo? gaps = milisegundos entre repintados CONSECUTIVOS del mapa mientras hay animacion (los huecos de reposo no cuentan).
     * Lento = la mediana supera `limitMs` (45 ms ≈ menos de 22 fotogramas por segundo) con al menos `minSamples` muestras.
     */
    function isSlow(gaps, limitMs, minSamples) {
        const g = (gaps || []).filter((x) => Number.isFinite(x) && x >= 0);
        if (g.length < (minSamples || 30)) return false;
        const sorted = g.slice().sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] > (limitMs || 45);
    }
    /** Modos de animacion: 0 apagada, 1 ahorro, 2 completa (valor de la cookie `ia`). Pulso, tope de fotogramas de un barrido y paso de la entrada de cada uno. */
    const ANIM_MODES = [
        { id: 'off', n: 0, pulse: null, glideMinMs: 0, enterStepMs: 0 },
        { id: 'saver', n: 1, pulse: { period: 800, rest: 7000 }, glideMinMs: 40, enterStepMs: 130 },
        { id: 'full', n: 2, pulse: { period: 1500, rest: 0 }, glideMinMs: 0, enterStepMs: 90 }
    ];
    const animMode = (n) => ANIM_MODES.find((m) => m.n === n) || ANIM_MODES[1];

    /* ---------------------------- Grupos para el filtro del usuario ---------------------------- */
    // El usuario marca/desmarca TIPOS de suceso en Ajustes. Cada icono pertenece a un solo grupo (convencion editorial; se prueba que no falte ni sobre ninguno).
    const GROUPS = [
        { id: 'war', icons: ['sword', 'musket', 'tank'], es: 'Guerras y batallas', en: 'Wars and battles' },
        { id: 'treaty', icons: ['treaty'], es: 'Tratados y acuerdos', en: 'Treaties and agreements' },
        { id: 'union', icons: ['union'], es: 'Alianzas, bodas y uniones', en: 'Alliances, weddings and unions' },
        { id: 'politics', icons: ['political', 'election'], es: 'Política y elecciones', en: 'Politics and elections' },
        { id: 'violence', icons: ['violence'], es: 'Atentados y violencia', en: 'Attacks and violence' },
        { id: 'natural', icons: ['natural'], es: 'Catástrofes naturales y epidemias', en: 'Natural disasters and epidemics' },
        { id: 'accident', icons: ['accident'], es: 'Accidentes', en: 'Accidents' },
        { id: 'birth', icons: ['birth'], es: 'Nacimientos', en: 'Births' },
        { id: 'death', icons: ['death'], es: 'Muertes', en: 'Deaths' },
        { id: 'works', icons: ['publication', 'composition'], es: 'Obras (libros, música)', en: 'Works (books, music)' },
        { id: 'discovery', icons: ['discovery'], es: 'Descubrimientos', en: 'Discoveries' },
        { id: 'culture', icons: ['sport', 'ceremony'], es: 'Deporte y ceremonias', en: 'Sport and ceremonies' },
        { id: 'extinction', icons: ['extinction'], es: 'Extinciones', en: 'Extinctions' },
        { id: 'other', icons: ['event', 'calendar'], es: 'Otros sucesos', en: 'Other events' }
    ];
    const GROUP_OF = {}; GROUPS.forEach((g) => g.icons.forEach((k) => { GROUP_OF[k] = g.id; }));
    const groupOf = (icon) => GROUP_OF[icon] || 'other';   // un icono nuevo sin grupo cae en «otros» en vez de desaparecer
    const GROUP_ALL_MASK = (1 << GROUPS.length) - 1;
    /** Lista de ids OCULTOS -> mascara de bits (un bit por grupo, en el orden de GROUPS). */
    const hiddenToMask = (list) => GROUPS.reduce((m, g, i) => (list && list.indexOf(g.id) >= 0 ? m | (1 << i) : m), 0);
    const maskToHidden = (m) => (Number.isInteger(m) && m >= 0 && m <= GROUP_ALL_MASK ? GROUPS.filter((g, i) => m & (1 << i)).map((g) => g.id) : []);
    /** ¿Se muestra este icono con esta mascara de grupos ocultos? */
    const iconShown = (icon, hiddenMask) => { const i = GROUPS.findIndex((g) => g.id === groupOf(icon)); return !(hiddenMask & (1 << i)); };

    /* ---------------------------- Tamano segun la distancia (zoom) ----------------------------
     * Con la Tierra lejos los iconos se encogen y, muy lejos, pasan a puntos de su color (sin perder el respiro del anillo).
     * ZOOM_SCALE: factor sobre el tamano normal por zoom (interpolado). DOT_ZOOM: [z0, z1]: por debajo de z0 solo puntos, por encima de z1 solo iconos,
     * entre ambos un fundido. Se construyen expresiones de MapLibre con 'zoom' en el nivel superior (obligatorio en MapLibre).
     */
    const ZOOM_SCALE = [[0, 0.3], [1.15, 0.45], [2.1, 0.8], [3.2, 1]];
    const DOT_ZOOM = [1.0, 1.3];      // tramo en el que crece el radio de los puntos
    const DOT_SWITCH = 1.15;          // por debajo de este zoom, puntos; por encima, iconos. Cambio seco: sin transparencias intermedias (pedido del creador)
    function zoomScale(z) {
        const S = ZOOM_SCALE; if (!(z > S[0][0])) return S[0][1]; if (z >= S[S.length - 1][0]) return S[S.length - 1][1];
        for (let i = 1; i < S.length; i++) if (z <= S[i][0]) { const t = (z - S[i - 1][0]) / (S[i][0] - S[i - 1][0]); return S[i - 1][1] + t * (S[i][1] - S[i - 1][1]); }
        return 1;
    }
    /** Se ven los iconos (1) o los puntos (0) a un zoom dado. */
    function iconShare(z) { return z >= DOT_SWITCH ? 1 : 0; }
    /** expr (tamano a escala 1) multiplicado por la escala del zoom: ['interpolate', ['linear'], ['zoom'], z, ['*', expr, k], ...]. */
    const zoomScaled = (expr, min) => ['interpolate', ['linear'], ['zoom']].concat(...ZOOM_SCALE.map(([z, k]) => [z, min === undefined ? ['*', expr, k] : ['max', min, ['*', expr, k]]]));
    /** Opacidad de los iconos: 0 con puntos (zoom < DOT_SWITCH), expr con iconos. */
    const iconFade = (expr) => ['step', ['zoom'], 0, DOT_SWITCH, expr];
    /** Opacidad de los puntos: expr con la Tierra muy lejos, 0 cuando ya se ven los iconos. */
    const dotFade = (expr) => ['step', ['zoom'], expr, DOT_SWITCH, 0];
    /** Radio del punto de color (px): crece un poco con la importancia y con el zoom. */
    const DOT_RADIUS = ['interpolate', ['linear'], ['zoom'], 0, ['interpolate', ['linear'], ['get', 'importance'], 0.3, 2, 1, 3.2], DOT_ZOOM[1], ['interpolate', ['linear'], ['get', 'importance'], 0.3, 2.8, 1, 4.4]];
    /** Color de cada punto: el del icono (o el que devuelva colorOf, p. ej. con el matiz de la epoca). Expresion 'match' sobre la propiedad icon. */
    const dotColorExpr = (colorOf) => ['match', ['get', 'icon']].concat(...KEYS.map((k) => [k, colorOf ? colorOf(COLORS[k], k) : COLORS[k]]), ['#888888']);

    return { ROLE_GLYPHS, ROLES, ROLE_IDS, ROLE_KEYS, PERSON_ICONS, drawKey, splitKey, glyphOf, hasGlyph, HALO, OUTER, OUTER_W, ZOOM_SCALE, DOT_ZOOM, DOT_SWITCH, zoomScale, iconShare, zoomScaled, iconFade, dotFade, DOT_RADIUS, dotColorExpr, ICON_CLASSES, KEYS, ANIM_MODES, animMode, isSlow, GROUPS, groupOf, GROUP_ALL_MASK, hiddenToMask, maskToHidden, iconShown, GLYPHS, COLORS, ERA_MUSKET_FROM, ERA_TANK_FROM, PRESENT, classify, eraIcon, animGroup, draw, enterParams, ENTER_FRAMES, ENTER_MS, pathBox, createPulse, shade, BORDER };
});
