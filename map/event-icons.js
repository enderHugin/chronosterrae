/* event-icons.js - Iconos de los sucesos: que icono corresponde a cada suceso, como se dibuja y como se anima.
 *
 * 1. classify(): suceso -> clave de icono. Se decide con lo que dice la FUENTE (clases de Wikidata P31 del registro, `classes`); solo si el
 *    registro no trae clases se deduce del nombre (como map/changes.js) y entonces `source` es 'name'. Todos los QID de ICON_CLASSES salen de
 *    los datos reales de data/events/ (scripts/check-event-icons.js comprueba que cada QID existe con esa etiqueta): ninguno de memoria.
 *    Las guerras y batallas llevan espada, mosquete o tanque segun la EPOCA del suceso (corte editorial, ver ERA_*): es una convencion de
 *    dibujo para distinguirlas de un vistazo, no una afirmacion sobre el armamento de ese conflicto concreto.
 * 2. GLYPHS: dibujos vectoriales (rutas SVG en una caja de 24x24). draw() los pinta con borde blanco sobre cualquier CanvasRenderingContext2D.
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
    const SWORD = [
        { d: 'M12 0.8 L13.5 3.4 V14.2 H10.5 V3.4 Z', t: 'f' }, { d: 'M5.6 14.2 H18.4 V16.6 H5.6 Z', t: 'k' }, { d: 'M11 16.6 H13 V20.6 H11 Z', t: 'k' }, { d: circle(12, 22.2, 1.6), t: 'f' }
    ];
    const rot = (parts, r) => parts.map((p) => Object.assign({ r }, p));
    const GLYPHS = {
        sword: rot(SWORD, -36).concat(rot(SWORD, 36)),
        musket: [
            { d: 'M1.5 8.6 H17 V12.2 H1.5 Z', t: 'f', r: -32 }, { d: 'M13 12.2 H17 L22.5 13.4 V18 H19 L16 15.6 H13 Z', t: 'k', r: -32 },
            { d: 'M3 7 V8.6', t: 'd', w: 1.8, r: -32 }, { d: circle(0.9, 6.6, 1.7), t: 'l', r: -32 }
        ],
        tank: [
            { d: 'M16 8.4 H23 V10.4 H16 Z', t: 'k' }, { d: 'M7.5 12 V9.8 a1.6 1.6 0 0 1 1.6 -1.6 H14.2 a1.6 1.6 0 0 1 1.6 1.6 V12 Z', t: 'f' },
            { d: 'M3 15.2 a3.2 3.2 0 0 1 3.2 -3.2 H17.8 a3.2 3.2 0 0 1 3.2 3.2 a3.2 3.2 0 0 1 -3.2 3.2 H6.2 a3.2 3.2 0 0 1 -3.2 -3.2 Z', t: 'f' },
            { d: circle(6.4, 15.2, 1.15), t: 'l' }, { d: circle(12, 15.2, 1.15), t: 'l' }, { d: circle(17.6, 15.2, 1.15), t: 'l' }
        ],
        treaty: [
            { d: 'M5 4 H17.5 V16 H5 Z', t: 'f' }, { d: 'M4.2 16 H18.3 a1.9 1.9 0 0 1 0 3.8 H6.1 a1.9 1.9 0 0 1 -1.9 -1.9 Z', t: 'k' },
            { d: 'M7.5 7.4 H14', t: 'c', w: 1.3 }, { d: 'M7.5 10.2 H13', t: 'c', w: 1.3 }, { d: 'M7.5 13 H11', t: 'c', w: 1.3 },
            { d: 'M21.5 1.8 C14.5 3.6 11.4 9 10.2 14.6 L12 13.8 C16.6 11.8 19.6 8 21.5 1.8 Z', t: 'k' }, { d: 'M10.2 14.6 L8.2 21', t: 'd', w: 1.5 }
        ],
        union: [
            { d: circle(9, 12, 5.4), t: 's', w: 2.6 }, { d: circle(15, 12, 5.4), t: 's', w: 2.6 }
        ],
        political: [
            { d: 'M5.5 3 V22', t: 'd', w: 1.9 }, { d: 'M5.5 4 H19.5 L16.2 8.6 L19.5 13.2 H5.5 Z', t: 'f' }
        ],
        natural: [
            { d: 'M1.5 21 L8.6 9.5 H15.4 L22.5 21 Z', t: 'f' }, { d: 'M12 8.4 C8.6 6.6 10.4 3.4 12 1.8 C13.6 3.4 15.4 6.6 12 8.4 Z', t: 'k' }
        ],
        violence: [{ d: star(12, 12, 11, 5.2, 8, -Math.PI / 2 + Math.PI / 16), t: 'f' }, { d: circle(12, 12, 2.6), t: 'l' }],
        election: [
            { d: 'M8 2.5 H16 V10 H8 Z', t: 'l' }, { d: 'M9.6 6.2 L11.4 8 L14.6 4', t: 's', w: 1.4 },
            { d: 'M3.5 10 H20.5 V21 H3.5 Z', t: 'f' }, { d: 'M7 13.6 H17', t: 'd', w: 1.8 }
        ],
        sport: [
            { d: 'M7 3 H17 V9 a5 5 0 0 1 -10 0 Z', t: 'f' }, { d: 'M7 5 H4.2 a2.8 2.8 0 0 0 2.9 5', t: 's', w: 1.6 }, { d: 'M17 5 H19.8 a2.8 2.8 0 0 1 -2.9 5', t: 's', w: 1.6 },
            { d: 'M10.8 13.8 H13.2 V17.6 H10.8 Z', t: 'f' }, { d: 'M7.5 17.6 H16.5 V21 H7.5 Z', t: 'k' }
        ],
        ceremony: [{ d: star(12, 12.8, 10.6, 4.4, 5), t: 'f' }],
        accident: [{ d: 'M12 2.5 L22.5 20.5 H1.5 Z', t: 'f' }, { d: 'M12 9 V14.4', t: 'c', w: 2 }, { d: circle(12, 17.4, 1.2), t: 'l' }],
        calendar: [
            { d: 'M3 5 H21 V21 H3 Z', t: 'f' }, { d: 'M3 5 H21 V9.4 H3 Z', t: 'k' }, { d: 'M8 2.4 V6.2', t: 'd', w: 1.8 }, { d: 'M16 2.4 V6.2', t: 'd', w: 1.8 },
            { d: 'M6.2 12 H9 V14.4 H6.2 Z', t: 'l' }, { d: 'M10.6 12 H13.4 V14.4 H10.6 Z', t: 'l' }, { d: 'M15 12 H17.8 V14.4 H15 Z', t: 'l' }, { d: 'M6.2 16.2 H9 V18.6 H6.2 Z', t: 'l' }, { d: 'M10.6 16.2 H13.4 V18.6 H10.6 Z', t: 'l' }
        ],
        birth: [
            { d: 'M12 21.5 V11', t: 's', w: 1.9 },
            { d: 'M12 14 C6 14 3.6 10 3.6 5.4 C9 5.4 12 8.6 12 14 Z', t: 'f' }, { d: 'M12 11.4 C12 6.4 15 3 20.4 3 C20.4 8.4 17.2 11.4 12 11.4 Z', t: 'f' }
        ],
        death: [{ d: 'M5.5 21.5 V10 a6.5 6.5 0 0 1 13 0 V21.5 Z', t: 'f' }, { d: 'M12 8 V16', t: 'c', w: 1.8 }, { d: 'M8.8 11.2 H15.2', t: 'c', w: 1.8 }],
        publication: [
            { d: 'M1.8 5.2 C6 4 10 4.4 12 6.6 V20.4 C10 18.4 6 18 1.8 19.2 Z', t: 'f' }, { d: 'M22.2 5.2 C18 4 14 4.4 12 6.6 V20.4 C14 18.4 18 18 22.2 19.2 Z', t: 'k' }
        ],
        composition: [
            { d: 'M9 17.4 V6.4', t: 's', w: 1.8 }, { d: 'M19 15.4 V4.4', t: 's', w: 1.8 }, { d: 'M9 6.2 L19 4 V7.8 L9 10 Z', t: 'f' },
            { d: ellipse(6.4, 17.6, 3.2, 2.5), t: 'f' }, { d: ellipse(16.4, 15.6, 3.2, 2.5), t: 'f' }
        ],
        discovery: [{ d: circle(9.6, 9.6, 6), t: 's', w: 2.6 }, { d: 'M14.2 14.2 L21 21', t: 's', w: 3.4 }, { d: 'M6.8 8.4 a3.2 3.2 0 0 1 2.6 -2.2', t: 'c', w: 1.3 }],
        extinction: [
            { d: 'M12 2 C6.4 2 3 5.8 3 10.4 C3 13.4 4.6 15.4 7 16.4 V20.6 H17 V16.4 C19.4 15.4 21 13.4 21 10.4 C21 5.8 17.6 2 12 2 Z', t: 'f' },
            { d: circle(8.4, 10.6, 2.3), t: 'l' }, { d: circle(15.6, 10.6, 2.3), t: 'l' }, { d: 'M10 20.6 V17.4 M14 20.6 V17.4', t: 'd', w: 1.2 }
        ],
        event: [{ d: circle(12, 12, 8.2), t: 'f' }, { d: circle(12, 12, 3), t: 'l' }]
    };
    const KEYS = Object.keys(GLYPHS);

    // Color del icono. Los tipos de registro mantienen los colores de siempre (KIND_COLORS de index.html); las clases, uno propio.
    const COLORS = {
        sword: '#c62828', musket: '#c62828', tank: '#c62828', treaty: '#8d6e3f', union: '#d4a017', political: '#ef6c00', natural: '#00897b', violence: '#8e1b52',
        election: '#3949ab', sport: '#00838f', ceremony: '#e91e63', accident: '#f9a825', calendar: '#607d8b',
        birth: '#43a047', death: '#6d4c41', publication: '#1e88e5', composition: '#8e24aa', discovery: '#f9a825', extinction: '#e53935', event: '#fb8c00'
    };
    // Grupo de animacion: 'shake' = sacudida horizontal (conflicto, desastre); 'bob' = flotar vertical (el resto).
    const SHAKE = new Set(['sword', 'musket', 'tank', 'violence', 'political', 'natural', 'accident']);
    const animGroup = (icon) => (SHAKE.has(icon) ? 'shake' : 'bob');

    const BORDER = 3.4;                // grosor del borde blanco (unidades de la caja 24x24; se ve la mitad por fuera)
    const shade = (hex, k) => {        // oscurece (k<0) o aclara (k>0) un #rrggbb
        const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
        return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
    };

    /* ---------------------------- Entrada animada ---------------------------- */
    // Al aparecer, cada icono hace un gesto corto y sobrio que dice lo que es (≈1 s, aceleracion suave, sin rebotes ni efectos): dos espadas que
    // se cruzan, una lapida que emerge de la tierra, un tanque que entra rodando, una pluma que escribe, dos anillos que se juntan, un brote que
    // crece... El resultado se pre-dibuja en ENTER_FRAMES fotogramas por icono (t de 0 a 1); el ultimo es identico al sprite estatico.
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
        musket: (e) => ({ rot: -40 * (1 - e), a: sub(e, 0, 0.4) }),
        tank: (e) => ({ dx: -16 * (1 - e), a: sub(e, 0, 0.35) }),
        treaty: (e, i) => {
            if (i <= 1) return { a: sub(e, 0, 0.3) };
            if (i <= 4) { const k = i - 2; return { sx: sub(e, 0.3 + 0.17 * k, 0.55 + 0.17 * k), pv: [7.5, 12], a: sub(e, 0.25, 0.4) }; }   // las lineas se van escribiendo
            return { dx: 5 * (1 - e), dy: -4 * (1 - e), a: sub(e, 0.1, 0.4) };                                                              // la pluma llega escribiendo
        },
        union: (e, i) => ({ dx: (i === 0 ? -6 : 6) * (1 - e), a: sub(e, 0, 0.4) }),
        political: (e, i) => (i === 0 ? { a: sub(e, 0, 0.3) } : { sx: sub(e, 0.15, 1), pv: [5.5, 8], a: sub(e, 0.1, 0.3) }),   // la bandera se despliega
        natural: (e, i) => (i === 0 ? { dy: 4 * (1 - e), a: sub(e, 0, 0.5) } : { sy: sub(e, 0.4, 1), pv: [12, 8.4], a: sub(e, 0.4, 0.6) }),
        violence: (e) => { const k = lerp(0.3, 1, settle(e)); return { sx: k, sy: k, a: sub(e, 0, 0.3) }; },
        election: (e, i) => (i <= 1 ? { dy: -6 * (1 - e), a: sub(e, 0, 0.5) } : { a: sub(e, 0, 0.3) }),   // la papeleta baja a la urna
        sport: (e) => ({ dy: 6 * (1 - e), a: sub(e, 0, 0.4) }),
        ceremony: (e) => { const k = lerp(0.5, 1, e); return { rot: -30 * (1 - e), sx: k, sy: k, a: sub(e, 0, 0.4) }; },
        accident: (e) => { const k = lerp(0.55, 1, e); return { sx: k, sy: k, pv: [12, 20.5], a: sub(e, 0, 0.4) }; },
        calendar: (e, i) => (i < 4 ? { dy: 4 * (1 - e), a: sub(e, 0, 0.35) } : { a: sub(e, 0.45 + 0.08 * (i - 4), 0.75 + 0.08 * (i - 4)) }),
        birth: (e, i) => (i === 0 ? { sy: sub(e, 0, 0.55), pv: [12, 21.5], a: sub(e, 0, 0.15) } : { sx: sub(e, 0.3, 1), sy: sub(e, 0.3, 1), pv: [12, 13], a: sub(e, 0.25, 0.5) }),   // el brote crece
        death: (e) => ({ dy: 16 * (1 - e), clip: 21.5 }),                                                                                   // la lapida emerge de la tierra
        publication: (e) => ({ sx: sub(e, 0, 1), pv: [12, 12], a: sub(e, 0, 0.3) }),                                                        // el libro se abre
        composition: (e) => ({ dy: 6 * (1 - e), a: sub(e, 0, 0.5) }),
        discovery: (e) => ({ rot: -35 * (1 - e), pv: [20, 20], a: sub(e, 0, 0.4) }),
        extinction: (e) => { const k = lerp(0.8, 1, e); return { sx: k, sy: k, a: sub(e, 0, 0.6) }; },
        event: (e) => { const k = lerp(0.4, 1, e); return { sx: k, sy: k, a: sub(e, 0, 0.5) }; }
    };
    const IDENT = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, a: 1, pv: [12, 12], clip: null };
    /** Transformacion de la parte `i` del icono `key` en el instante t (0..1) de su entrada. En t >= 1 es la identidad. */
    function enterParams(key, t, i) {
        if (!(t < 1)) return Object.assign({}, IDENT);
        const f = ENTER[key]; if (!f) return Object.assign({}, IDENT);
        return Object.assign({}, IDENT, f(easeOut(Number.isFinite(t) ? t : 0), i));
    }
    const isIdent = (tr) => tr.dx === 0 && tr.dy === 0 && tr.rot === 0 && tr.sx === 1 && tr.sy === 1 && tr.a === 1 && tr.clip === null;

    /**
     * Dibuja el icono `key` en un cuadrado de `size` px (esquina superior izquierda en (x,y)): primero el borde blanco de toda la silueta y encima
     * el relleno. Opciones: `Path2D` y `color` (por defecto, el global y el color del icono) y `t` (0..1, instante de la entrada animada; sin él,
     * el dibujo final).
     */
    function draw(ctx, key, size, o) {
        const parts = GLYPHS[key]; if (!parts) throw new Error('icono desconocido: ' + key);
        const P2D = (o && o.Path2D) || (typeof Path2D !== 'undefined' ? Path2D : null); if (!P2D) throw new Error('falta Path2D');
        const color = (o && o.color) || COLORS[key]; const dark = shade(color, -0.4); const light = '#ffffff';
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
        parts.forEach((p, i) => {                                  // 1. borde blanco de todo lo que no es detalle claro
            const tr = trs[i]; if (p.t === 'l' || p.t === 'c' || tr.a <= 0 || tr.sx === 0 || tr.sy === 0) return;
            ctx.save(); place(p, tr); ctx.globalAlpha = tr.a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = BORDER + ((p.t === 's' || p.t === 'd') ? (p.w || 2) : 0); ctx.stroke(new P2D(p.d)); ctx.restore();
        });
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

    return { ICON_CLASSES, KEYS, ANIM_MODES, animMode, isSlow, GROUPS, groupOf, GROUP_ALL_MASK, hiddenToMask, maskToHidden, iconShown, GLYPHS, COLORS, ERA_MUSKET_FROM, ERA_TANK_FROM, PRESENT, classify, eraIcon, animGroup, draw, enterParams, ENTER_FRAMES, ENTER_MS, pathBox, createPulse, shade, BORDER };
});
