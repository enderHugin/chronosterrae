/* eras.js - Plantilla de ambientacion por epoca: a cada tramo de la historia le corresponde un "look" (paleta, tipografia, ornamentos, cursor,
 * estilo de los iconos y colores del mapa) para que, al llegar a una fecha, se sepa de un vistazo en que epoca se esta.
 *
 * Es PURO (sin DOM): index.html solo aplica el resultado. Se prueba entero en Node (scripts/check-eras.js): rangos contiguos sin huecos ni solapes,
 * plantilla completa en todas las epocas, contraste legible (WCAG) en claro y oscuro, SVG bien formados y sin recursos externos.
 *
 * LA PLANTILLA (cada epoca rellena estas ranuras; ver ERAS):
 *   id, from        primer anio astronomico de la epoca (el 0 existe; 1 a. C. = 0). Termina donde empieza la siguiente.
 *   name, note      nombre y aviso (es/en). Las edades son CONVENCIONES regionales (sobre todo eurasiaticas): la nota lo dice.
 *   light, dark     paleta: bg, panel, text, muted, accent, ok, warn, err (hex). Texto sobre panel >= 4,5:1; ok/warn >= 3:1.
 *   map             colores del mapa por tema: ocean, shelf, land, landLine, line
 *   type            tipografia: heading, ui (solo familias del sistema, acabadas en una generica), weight, transform, spacing, style
 *   shape           border (solid/double/ridge/dashed/dotted), bw (px), radius (px de los recuadros), btnRadius
 *   ornament        corner (adorno de esquinas), divider (filete bajo los titulos), texture (trama muy tenue del fondo de los recuadros)
 *   cursor          glifo del cursor sobre el mapa (null = el del sistema)
 *   icons           estilo de los iconos de sucesos: rim (borde claro que sigue la silueta), tint {color, amt} (matiz sobre el color propio, que sigue siendo reconocible)
 * Intensidad: 0 = sin ambientacion (aspecto neutro de siempre); 1 = sutil (paleta, tipografia y nombre de la epoca); 2 = completa (ademas formas,
 * ornamentos, texturas, cursor, iconos y colores del mapa).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosEras = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* ---------------------------- Color ---------------------------- */
    const toRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const lum = (h) => { const [r, g, b] = toRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    /** Razon de contraste WCAG entre dos #rrggbb. */
    function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
    /** Mezcla a (peso 1-t) con b (peso t). */
    function mix(a, b, t) { const x = toRgb(a), y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); }
    const PANEL_ALPHA = 0.92;
    const rgba = (h, a) => { const c = toRgb(h); return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + a + ')'; };

    /* ---------------------------- Plantilla de paleta ---------------------------- */
    const LIGHT_STATE = { ok: '#2e7d32', warn: '#8f5b00', err: '#c62828' };
    const DARK_STATE = { ok: '#66bb6a', warn: '#e0a63a', err: '#ef7373' };
    const pl = (bg, panel, text, muted, accent) => Object.assign({ bg, panel, text, muted, accent }, LIGHT_STATE);
    const pd = (bg, panel, text, muted, accent) => Object.assign({ bg, panel, text, muted, accent }, DARK_STATE);
    const mp = (ocean, shelf, land, landLine, line) => ({ ocean, shelf, land, landLine, line });

    const SERIF = 'serif', SANS = 'sans-serif', MONO = 'monospace';
    const SYS_UI = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    const READ_FONT = SYS_UI;     // letra de lectura: la misma en todas las epocas (solo los titulos cambian)

    /* ---------------------------- Las epocas ---------------------------- */
    const ERAS = [
        { id: 'deep', from: -1e12, name: { es: 'Tiempo profundo', en: 'Deep time' },
            note: { es: 'Antes de cualquier humano: la Tierra geológica.', en: 'Before any human: the geological Earth.' },
            light: pl('#e3e5e8', '#eceef0', '#1f2328', '#4d545c', '#4a3a8a'), dark: pd('#121417', '#1a1d21', '#e3e6ea', '#9aa1aa', '#b9a6ff'),
            map: { light: mp('#a3b8c9', '#c0d0dc', '#e4ded2', '#9a9080', '#33302b'), dark: mp('#0a141c', '#142633', '#34312d', '#6a655c', '#e3dfd6') },
            type: { heading: "'Rockwell', 'Roboto Slab', 'Courier New', serif", weight: 800, transform: 'uppercase', spacing: '0.08em', style: 'normal' },
            shape: { border: 'solid', bw: 2, radius: 14, btnRadius: 10 },
            ornament: { corner: 'chip', divider: 'strata', texture: 'strata' }, cursor: 'pick',
            icons: { rim: '#e9e1d2', tint: { color: '#8a3410', amt: 0.22 } } },
        { id: 'paleolithic', from: -3000000, name: { es: 'Paleolítico', en: 'Palaeolithic' },
            note: { es: 'Era glacial y cazadores-recolectores (convención).', en: 'Ice age hunter-gatherers (convention).' },
            light: pl('#e8dcc9', '#f0e6d4', '#2a1d14', '#5e4a39', '#8a3517'), dark: pd('#1a130e', '#231a13', '#ecdfcc', '#a8967f', '#e58a5c'),
            map: { light: mp('#a9c3cf', '#c6d6dc', '#eddfc4', '#b09a76', '#4a2a18'), dark: mp('#0b151a', '#16262d', '#352d24', '#6b5c48', '#eadbc4') },
            type: { heading: "'Rockwell', 'Roboto Slab', 'Courier New', serif", weight: 800, transform: 'uppercase', spacing: '0.06em', style: 'normal' },
            shape: { border: 'solid', bw: 3, radius: 16, btnRadius: 12 },
            ornament: { corner: 'hands', divider: 'dots', texture: 'grain' }, cursor: 'flint',
            icons: { rim: '#f1e2c6', tint: { color: '#a0502a', amt: 0.3 } } },
        { id: 'neolithic', from: -9500, name: { es: 'Neolítico', en: 'Neolithic' },
            note: { es: 'Agricultura y aldeas; el momento varía mucho según la región.', en: 'Farming and villages; timing varies a lot by region.' },
            light: pl('#e5e7cc', '#eef0d9', '#262a14', '#555c33', '#3f6a10'), dark: pd('#13170d', '#1b2013', '#e6e9cc', '#a3ab82', '#8ed46a'),
            map: { light: mp('#aacfc9', '#c6ddd2', '#e8e9c8', '#a5a572', '#3d4318'), dark: mp('#0a1816', '#14292a', '#2c3022', '#626a46', '#e0e3c3') },
            type: { heading: "'Rockwell', 'Cambria', 'Georgia', serif", weight: 700, transform: 'none', spacing: '0.02em', style: 'normal' },
            shape: { border: 'dashed', bw: 2, radius: 12, btnRadius: 9 },
            ornament: { corner: 'spiral', divider: 'zigzag', texture: 'weave' }, cursor: 'axe',
            icons: { rim: '#eef0cf', tint: { color: '#6d7a1c', amt: 0.28 } } },
        { id: 'bronze', from: -3299, name: { es: 'Edad del Bronce', en: 'Bronze Age' },
            note: { es: 'Convención sobre todo del Próximo Oriente y Europa; en otras regiones no hubo, o fue otra fecha.', en: 'Mainly a Near East / Europe convention; elsewhere it did not happen, or at another date.' },
            light: pl('#dfe9e2', '#e9f2ec', '#17261f', '#46584d', '#0f6b5c'), dark: pd('#0e1715', '#15211e', '#dcebe4', '#97aaa1', '#5fd6c0'),
            map: { light: mp('#b3d3d0', '#cce0dc', '#e4dbb9', '#a8935a', '#5a3a10'), dark: mp('#08181a', '#10292a', '#33301f', '#6f6338', '#ecdcae') },
            type: { heading: "'Trajan Pro', 'Optima', 'Palatino Linotype', 'Book Antiqua', serif", weight: 700, transform: 'uppercase', spacing: '0.07em', style: 'normal' },
            shape: { border: 'double', bw: 4, radius: 3, btnRadius: 3 },
            ornament: { corner: 'step', divider: 'meander', texture: 'none' }, cursor: 'spear',
            icons: { rim: '#ecd8a6', tint: { color: '#2e8b78', amt: 0.24 } } },
        { id: 'iron', from: -1199, name: { es: 'Edad del Hierro', en: 'Iron Age' },
            note: { es: 'Convención eurasiática; empieza en fechas distintas según la región.', en: 'Eurasian convention; begins at different dates by region.' },
            light: pl('#e1e2e6', '#eaebee', '#1d2026', '#4c525c', '#8a2f1a'), dark: pd('#121317', '#1a1c21', '#e4e6ea', '#9ba0aa', '#e8826a'),
            map: { light: mp('#b8cbd8', '#cfdce5', '#dcd8cf', '#9c9484', '#3a2f2a'), dark: mp('#0a141d', '#132432', '#312f2d', '#68645c', '#e6e2da') },
            type: { heading: "'Palatino Linotype', 'Book Antiqua', 'Palatino', serif", weight: 800, transform: 'uppercase', spacing: '0.05em', style: 'normal' },
            shape: { border: 'ridge', bw: 4, radius: 2, btnRadius: 2 },
            ornament: { corner: 'knotwork', divider: 'rope', texture: 'weave' }, cursor: 'celtic',
            icons: { rim: '#d3d6dc', tint: { color: '#8a3b22', amt: 0.26 } } },
        { id: 'classical', from: -499, name: { es: 'Antigüedad clásica', en: 'Classical antiquity' },
            note: { es: 'Grecia y Roma; en el resto del mundo, otros periodos.', en: 'Greece and Rome; other periods elsewhere in the world.' },
            light: pl('#f3f0e8', '#faf8f2', '#1b2433', '#4a5568', '#1c4d8c'), dark: pd('#0d1420', '#142031', '#e4ebf6', '#97a6bd', '#85b4ee'),
            map: { light: mp('#a9cfe6', '#c6e0ee', '#efe6d2', '#bda878', '#8a3a1c'), dark: mp('#07182a', '#0e2b45', '#363126', '#76694c', '#efe3c9') },
            type: { heading: "'Trajan Pro', 'Cinzel', 'Palatino Linotype', 'Book Antiqua', serif", weight: 700, transform: 'uppercase', spacing: '0.1em', style: 'normal' },
            shape: { border: 'double', bw: 4, radius: 0, btnRadius: 0 },
            ornament: { corner: 'meander', divider: 'meander2', texture: 'none' }, cursor: 'laurel',
            icons: { rim: '#f7f3e8', tint: { color: '#2a5fa8', amt: 0.2 } } },
        { id: 'earlymed', from: 476, name: { es: 'Alta Edad Media', en: 'Early Middle Ages' },
            note: { es: 'Del 476 al 1000 aprox.; convención europea.', en: 'c. 476–1000; a European convention.' },
            light: pl('#ece3c6', '#f4edd4', '#1f2a1c', '#4f5a47', '#2b5a34'), dark: pd('#10160e', '#181f14', '#e9eed8', '#a1ac90', '#97cf86'),
            map: { light: mp('#b6d0cc', '#cde0d8', '#e7dcb4', '#a99b64', '#2b3f22'), dark: mp('#08171a', '#10282a', '#2f2e20', '#6a6638', '#e3dfb7') },
            type: { heading: "'Papyrus', 'Uncial Antiqua', 'Palatino Linotype', 'Book Antiqua', serif", weight: 700, transform: 'none', spacing: '0.03em', style: 'italic' },
            shape: { border: 'solid', bw: 3, radius: 8, btnRadius: 6 },
            ornament: { corner: 'knot', divider: 'vine', texture: 'paper' }, cursor: 'quill',
            icons: { rim: '#f3e6b4', tint: { color: '#2f6b3a', amt: 0.24 } } },
        { id: 'highmed', from: 1000, name: { es: 'Plena y Baja Edad Media', en: 'High and Late Middle Ages' },
            note: { es: 'Del 1000 a 1450 aprox.; convención europea.', en: 'c. 1000–1450; a European convention.' },
            light: pl('#eee1d0', '#f6ebdc', '#2a1620', '#634452', '#5a1f7a'), dark: pd('#0f1021', '#171832', '#ecebf8', '#a3a6c4', '#c79bff'),
            map: { light: mp('#b4cde0', '#cbdfeb', '#ebdcc0', '#ad976d', '#5a1626'), dark: mp('#080f26', '#10204a', '#2d2a28', '#6e6048', '#f0dfb0') },
            type: { heading: "'Garamond', 'Palatino Linotype', 'Book Antiqua', serif", weight: 700, transform: 'none', spacing: '0.04em', style: 'normal' },
            shape: { border: 'double', bw: 4, radius: 0, btnRadius: 0 },
            ornament: { corner: 'trefoil', divider: 'diamonds', texture: 'paper' }, cursor: 'sword',
            icons: { rim: '#f2e4b9', tint: { color: '#8a1f33', amt: 0.24 } } },
        { id: 'renaissance', from: 1450, name: { es: 'Renacimiento y Barroco', en: 'Renaissance and Baroque' },
            note: { es: 'De 1450 a 1700 aprox.; convención europea.', en: 'c. 1450–1700; a European convention.' },
            light: pl('#f0e3c9', '#f8edd7', '#2b1d10', '#5f4a30', '#6e4f08'), dark: pd('#1a120b', '#241912', '#f0e2c8', '#ad9a7e', '#e6bd62'),
            map: { light: mp('#b3cddb', '#cadee8', '#efdcb4', '#b09559', '#4e3208'), dark: mp('#0a1218', '#14232d', '#352b1d', '#78633a', '#f2dfae') },
            type: { heading: "'Baskerville', 'Garamond', 'Palatino Linotype', serif", weight: 600, transform: 'none', spacing: '0.02em', style: 'italic' },
            shape: { border: 'double', bw: 3, radius: 2, btnRadius: 2 },
            ornament: { corner: 'flourish', divider: 'scroll', texture: 'linen' }, cursor: 'dividers',
            icons: { rim: '#f6e3b0', tint: { color: '#8a5d0a', amt: 0.3 } } },
        { id: 'enlightenment', from: 1700, name: { es: 'Ilustración y revoluciones', en: 'Enlightenment and revolutions' },
            note: { es: 'De 1700 a 1830 aprox.; convención europea y atlántica.', en: 'c. 1700–1830; a European and Atlantic convention.' },
            light: pl('#f1ece7', '#f9f5f1', '#2a1c2a', '#5f4a5d', '#a02b5f'), dark: pd('#181219', '#221a24', '#efe4f0', '#ab97ab', '#f08fb4'),
            map: { light: mp('#bdd0e0', '#d2e0ec', '#efe6d6', '#b3a07e', '#4a2342'), dark: mp('#0c1320', '#162438', '#352d33', '#72606d', '#efe0ec') },
            type: { heading: "'Baskerville', 'Didot', 'Bodoni 72', 'Times New Roman', serif", weight: 700, transform: 'none', spacing: '0.01em', style: 'normal' },
            shape: { border: 'solid', bw: 2, radius: 4, btnRadius: 4 },
            ornament: { corner: 'laurel', divider: 'garland', texture: 'linen' }, cursor: 'nib',
            icons: { rim: '#f7eef4', tint: { color: '#7a3a68', amt: 0.22 } } },
        { id: 'industrial', from: 1830, name: { es: 'Era industrial', en: 'Industrial age' },
            note: { es: 'De 1830 a 1914 aprox.; convención europea y norteamericana.', en: 'c. 1830–1914; a European and North American convention.' },
            light: pl('#e6dfd2', '#efe9dd', '#231c17', '#574c42', '#962d12'), dark: pd('#151210', '#1e1a17', '#ece5da', '#aaa093', '#ee8a5a'),
            map: { light: mp('#b8cbd2', '#cfdde0', '#e6dcc6', '#a8977a', '#3e2418'), dark: mp('#0b1316', '#142228', '#332e29', '#6d6254', '#eadfcd') },
            type: { heading: "'Rockwell', 'Clarendon', 'Georgia', serif", weight: 800, transform: 'none', spacing: '0', style: 'normal' },
            shape: { border: 'ridge', bw: 4, radius: 3, btnRadius: 3 },
            ornament: { corner: 'rivet', divider: 'cogs', texture: 'hatch' }, cursor: 'arrow-chunky',
            icons: { rim: '#e9ddc6', tint: { color: '#6e3a22', amt: 0.28 } } },
        { id: 'modern', from: 1914, name: { es: 'Siglo XX', en: '20th century' },
            note: { es: 'De 1914 a 1990 aprox.', en: 'c. 1914–1990.' },
            light: pl('#efede6', '#f7f5ef', '#1a1a1a', '#53514b', '#00756a'), dark: pd('#0f0f10', '#18181a', '#f0eee6', '#a6a49b', '#4fd6c8'),
            map: { light: mp('#b8d0dd', '#cfe0ea', '#ebe5d3', '#aaa085', '#262626'), dark: mp('#0a121a', '#122030', '#2f2f2d', '#66645c', '#efede5') },
            type: { heading: "'Futura', 'Century Gothic', 'Avenir Next', 'Trebuchet MS', sans-serif", weight: 700, transform: 'uppercase', spacing: '0.12em', style: 'normal' },
            shape: { border: 'solid', bw: 2, radius: 0, btnRadius: 0 },
            ornament: { corner: 'deco', divider: 'deco', texture: 'halftone' }, cursor: 'arrow',
            icons: { rim: '#ffffff', tint: { color: '#b02e0c', amt: 0.12 } } },
        { id: 'digital', from: 1990, name: { es: 'Era digital', en: 'Digital age' },
            note: { es: 'De 1990 a hoy.', en: 'c. 1990 to today.' },
            light: pl('#f3f5f8', '#fbfcfd', '#14181f', '#4d5663', '#1f5fbf'), dark: pd('#0e1116', '#161b22', '#e7ebf1', '#9aa4b2', '#6aa7ff'),
            map: { light: mp('#c3dbe9', '#dbeaf2', '#ece9df', '#bdb69f', '#3a3a3a'), dark: mp('#0b1a26', '#17303f', '#2d3338', '#59636b', '#e6e2d8') },
            type: { heading: SYS_UI, weight: 700, transform: 'none', spacing: '0', style: 'normal' },
            shape: { border: 'solid', bw: 1, radius: 10, btnRadius: 8 },
            ornament: { corner: 'bracket', divider: 'line', texture: 'none' }, cursor: null,
            icons: { rim: '#ffffff', tint: { color: '#1f5fbf', amt: 0 } } },
        { id: 'future', from: 2027, name: { es: 'Futuro (proyección)', en: 'Future (projection)' },
            note: { es: 'Fechas posteriores a hoy: no hay registros, solo proyecciones.', en: 'Dates after today: no records, only projections.' },
            light: pl('#e6f2f4', '#f0f8f9', '#0d1f24', '#3f5a61', '#00606e'), dark: pd('#050a10', '#0b131c', '#e0f6fa', '#8fb2ba', '#5ef0ff'),
            map: { light: mp('#b2dfe6', '#cbe9ee', '#e3ece6', '#9eb8ac', '#0d3a44'), dark: mp('#030a12', '#08202e', '#1b2a2a', '#3f6a6a', '#c9f6fa') },
            type: { heading: "'Orbitron', 'Eurostile', 'Bank Gothic', ui-monospace, 'SF Mono', Menlo, Consolas, monospace", weight: 700, transform: 'uppercase', spacing: '0.12em', style: 'normal' },
            shape: { border: 'solid', bw: 1, radius: 2, btnRadius: 2 },
            ornament: { corner: 'target', divider: 'scan', texture: 'scan' }, cursor: 'arrow-future',
            icons: { rim: '#d8fbff', tint: { color: '#00a3b8', amt: 0.3 } } }
    ];

    const BY_ID = {}; ERAS.forEach((e) => { BY_ID[e.id] = e; });
    const byId = (id) => BY_ID[id] || null;
    const SLOTS = ['id', 'from', 'name', 'note', 'light', 'dark', 'map', 'type', 'shape', 'ornament', 'cursor', 'icons'];

    /** Epoca a la que pertenece un anio astronomico (el 0 existe: 1 a. C. = 0). NaN o no finito -> la actual (digital). */
    function at(year) {
        if (!Number.isFinite(year)) return BY_ID.digital;
        let r = ERAS[0];
        for (let i = 0; i < ERAS.length; i++) { if (year >= ERAS[i].from) r = ERAS[i]; else break; }
        return r;
    }
    const indexOf = (id) => ERAS.findIndex((e) => e.id === id);
    /** Ultimo anio (incluido) de la epoca i; la ultima no tiene fin. */
    const lastYear = (i) => (i + 1 < ERAS.length ? ERAS[i + 1].from - 1 : Infinity);
    const labelOf = (era, lang) => era.name[lang === 'en' ? 'en' : 'es'];
    const noteOf = (era, lang) => era.note[lang === 'en' ? 'en' : 'es'];

    /* ---------------------------- Ornamentos (SVG) ---------------------------- */
    const svg = (w, h, body) => '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + body + '</svg>';
    const st = (c, w, o) => 'fill="none" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + (o ? ' opacity="' + o + '"' : '');
    const fl = (c, o) => 'fill="' + c + '"' + (o ? ' opacity="' + o + '"' : '');

    // Esquinas (16x16, esquina superior izquierda; la inferior derecha es la misma girada 180 grados)
    const CORNERS = {
        chip: (c) => '<path d="M1 1 H9 L7 4 L9 6 L4 9 L1 9 Z" ' + fl(c, 0.35) + '/><path d="M1 1 H9 L7 4 L9 6 L4 9 L1 9 Z" ' + st(c, 1) + '/>',
        hands: (c) => '<circle cx="4" cy="4" r="1.6" ' + fl(c) + '/><circle cx="8" cy="3" r="1.3" ' + fl(c) + '/><circle cx="11" cy="5" r="1.2" ' + fl(c) + '/><circle cx="3" cy="8" r="1.3" ' + fl(c) + '/><circle cx="5" cy="11" r="1.2" ' + fl(c) + '/>',
        spiral: (c) => '<path d="M2 14 C2 5 6 2 11 2 C14 2 14 7 10 7 C7 7 6 5 8 4" ' + st(c, 1.4) + '/>',
        step: (c) => '<path d="M1 15 V1 H15 M4 15 V4 H15 M7 15 V7 H15" ' + st(c, 1.2) + '/>',
        knotwork: (c) => '<path d="M2 14 C2 6 6 2 14 2 M2 10 C6 10 10 6 10 2 M2 6 C4 6 6 4 6 2" ' + st(c, 1.4) + '/><circle cx="6" cy="10" r="1.4" ' + fl(c) + '/>',
        meander: (c) => '<path d="M1 15 V1 H15 V4 H4 V12 H12 V8 H8" ' + st(c, 1.3) + '/>',
        knot: (c) => '<path d="M2 8 C2 2 8 2 8 8 C8 14 14 14 14 8 C14 3 9 3 9 8" ' + st(c, 1.3) + '/><path d="M3 3 C6 6 10 10 13 13" ' + st(c, 1.3) + '/>',
        trefoil: (c) => '<circle cx="5" cy="5" r="2.4" ' + st(c, 1.3) + '/><circle cx="10" cy="5" r="2.4" ' + st(c, 1.3) + '/><circle cx="7.5" cy="9.5" r="2.4" ' + st(c, 1.3) + '/><path d="M7.5 12 V15" ' + st(c, 1.3) + '/>',
        flourish: (c) => '<path d="M1 14 C1 5 6 1 14 1 M1 8 C4 8 7 5 7 2 M5 14 C5 10 9 8 12 8" ' + st(c, 1.3) + '/>',
        laurel: (c) => '<path d="M2 14 C2 9 4 5 9 2" ' + st(c, 1.2) + '/><path d="M3 11 C1 9 1 7 2 6 C4 7 4 9 3 11 Z M5 8 C3 6 4 4 5 3 C7 4 7 6 5 8 Z M8 6 C6 4 8 2 9 2 C10 3 10 5 8 6 Z" ' + fl(c, 0.8) + '/>',
        rivet: (c) => '<circle cx="6" cy="6" r="3.6" ' + st(c, 1.4) + '/><path d="M3.6 6 H8.4 M6 3.6 V8.4" ' + st(c, 1.2) + '/>',
        deco: (c) => '<path d="M1 15 A14 14 0 0 1 15 1 M1 10 A9 9 0 0 1 10 1 M1 5 A4 4 0 0 1 5 1" ' + st(c, 1.3) + '/>',
        bracket: (c) => '<path d="M1.5 9 V1.5 H9" ' + st(c, 1.4) + '/>',
        target: (c) => '<path d="M1.5 10 V1.5 H10" ' + st(c, 1.4) + '/><path d="M12 1.5 H14.5 V4" ' + st(c, 1.4, 0.7) + '/><circle cx="5" cy="5" r="1.3" ' + fl(c) + '/>'
    };
    // Filetes (24x6, se repiten en horizontal bajo los titulos)
    const DIVIDERS = {
        strata: (c) => '<path d="M0 2 Q6 0 12 2 T24 2 M0 5 Q6 3 12 5 T24 5" ' + st(c, 1, 0.8) + '/>',
        dots: (c) => '<circle cx="4" cy="3" r="1.3" ' + fl(c) + '/><circle cx="12" cy="3" r="1.3" ' + fl(c) + '/><circle cx="20" cy="3" r="1.3" ' + fl(c) + '/>',
        zigzag: (c) => '<path d="M0 5 L3 1 L6 5 L9 1 L12 5 L15 1 L18 5 L21 1 L24 5" ' + st(c, 1.2) + '/>',
        meander: (c) => '<path d="M0 5 H3 V1 H9 V5 H12 V1 H18 V5 H21 V1 H24" ' + st(c, 1.1) + '/>',
        rope: (c) => '<path d="M0 5 L3 1 M3 5 L6 1 M6 5 L9 1 M9 5 L12 1 M12 5 L15 1 M15 5 L18 1 M18 5 L21 1 M21 5 L24 1" ' + st(c, 1.3) + '/>',
        meander2: (c) => '<path d="M0 3 H24" ' + st(c, 0.8) + '/><path d="M0 5.5 H4 V1 H8 V4 H6 M12 5.5 H16 V1 H20 V4 H18" ' + st(c, 1) + '/>',
        vine: (c) => '<path d="M0 3 C3 0 6 6 9 3 S15 0 18 3 S21 6 24 3" ' + st(c, 1.1) + '/><circle cx="9" cy="3" r="1" ' + fl(c) + '/><circle cx="21" cy="3" r="1" ' + fl(c) + '/>',
        diamonds: (c) => '<path d="M6 0.5 L9 3 L6 5.5 L3 3 Z M18 0.5 L21 3 L18 5.5 L15 3 Z" ' + fl(c) + '/><path d="M9 3 H15 M0 3 H3 M21 3 H24" ' + st(c, 0.8) + '/>',
        scroll: (c) => '<path d="M0 3 H6 C8 3 8 0.8 6.4 0.8 C5 0.8 5 3 7 4.4 M24 3 H18 C16 3 16 5.2 17.6 5.2 C19 5.2 19 3 17 1.6 M8 3 H16" ' + st(c, 1) + '/>',
        garland: (c) => '<path d="M0 1 Q3 6 6 1 Q9 6 12 1 Q15 6 18 1 Q21 6 24 1" ' + st(c, 1) + '/>',
        cogs: (c) => '<path d="M0 5 H2 V2 H5 V5 H8 V2 H11 V5 H14 V2 H17 V5 H20 V2 H23 V5 H24" ' + st(c, 1.2) + '/>',
        deco: (c) => '<path d="M0 1.5 H24 M0 4.5 H9 M15 4.5 H24" ' + st(c, 1) + '/><path d="M12 5.5 L9.5 3 H14.5 Z" ' + fl(c) + '/>',
        line: (c) => '<path d="M0 3 H24" ' + st(c, 1, 0.8) + '/>',
        scan: (c) => '<path d="M0 3 H8 M11 3 H13 M16 3 H24" ' + st(c, 1.2) + '/>'
    };
    // Texturas (48x48, muy tenues: la legibilidad del texto no puede depender de ellas)
    const TEXTURES = {
        grain: (c) => [[5, 7], [18, 3], [30, 11], [42, 5], [9, 21], [24, 18], [37, 24], [3, 35], [16, 31], [29, 38], [44, 34], [12, 44], [34, 46]].map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (0.7 + (i % 3) * 0.3) + '" ' + fl(c, 0.2) + '/>').join(''),
        strata: (c) => '<path d="M0 10 Q12 6 24 10 T48 10 M0 26 Q12 22 24 26 T48 26 M0 42 Q12 38 24 42 T48 42" ' + st(c, 1, 0.14) + '/>',
        weave: (c) => '<path d="M0 8 H48 M0 24 H48 M0 40 H48" ' + st(c, 1.4, 0.12) + '/><path d="M8 0 V48 M24 0 V48 M40 0 V48" ' + st(c, 1.4, 0.1) + '/>',
        paper: (c) => [[7, 9], [20, 5], [33, 14], [44, 8], [12, 26], [27, 22], [40, 30], [5, 40], [22, 38], [36, 44]].map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="0.6" ' + fl(c, 0.22) + '/>').join(''),
        linen: (c) => '<path d="M0 6 H48 M0 18 H48 M0 30 H48 M0 42 H48 M6 0 V48 M18 0 V48 M30 0 V48 M42 0 V48" ' + st(c, 0.6, 0.12) + '/>',
        hatch: (c) => '<path d="M0 48 L48 0 M-12 48 L36 0 M12 48 L60 0" ' + st(c, 0.7, 0.1) + '/>',
        halftone: (c) => [8, 24, 40].map((y) => [8, 24, 40].map((x) => '<circle cx="' + x + '" cy="' + y + '" r="1.3" ' + fl(c, 0.14) + '/>').join('')).join(''),
        scan: (c) => '<path d="M0 4 H48 M0 12 H48 M0 20 H48 M0 28 H48 M0 36 H48 M0 44 H48" ' + st(c, 0.7, 0.1) + '/>'
    };
    const cornerOf = (kind, color, br) => (CORNERS[kind] ? svg(16, 16, br ? '<g transform="rotate(180 8 8)">' + CORNERS[kind](color) + '</g>' : CORNERS[kind](color)) : null);
    const dividerOf = (kind, color) => (DIVIDERS[kind] ? svg(24, 6, DIVIDERS[kind](color)) : null);
    const textureOf = (kind, color) => (TEXTURES[kind] ? svg(48, 48, TEXTURES[kind](color)) : null);
    const dataUrl = (s) => 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';

    /* ---------------------------- Cursores ---------------------------- */
    // Cada glifo se dibuja con la punta en el origen y el cuerpo hacia +y; rot lo gira para que la punta mire arriba a la izquierda.
    const GLYPHS = {
        pick: { rot: -45, d: 'M0 0 C6 1 12 4 16 10 L13 12 C9 8 5 5 0 0 Z M10 8 L18 30 L15 31 L7 9 Z' },
        flint: { rot: -45, d: 'M0 0 L6 10 L4 12 L8 22 L0 19 L-8 22 L-4 12 L-6 10 Z' },
        axe: { rot: -45, d: 'M0 0 L9 4 L9 12 L2 14 L2 33 L-1 33 L-1 14 L-7 12 L-7 4 Z' },
        spear: { rot: -45, d: 'M0 0 C6 6 6 13 0 17 C-6 13 -6 6 0 0 Z M-1 17 H1 V34 H-1 Z' },
        celtic: { rot: -45, d: 'M0 0 L3 5 L3 22 L8 22 L8 26 L2 26 L2 33 L-2 33 L-2 26 L-8 26 L-8 22 L-3 22 L-3 5 Z' },
        laurel: { rot: -45, d: 'M0 0 C8 5 9 14 3 20 L0 33 L-1 20 C-8 14 -7 5 0 0 Z' },
        quill: { rot: -45, d: 'M0 0 L2 6 C9 9 11 18 7 27 C3 33 -2 33 -4 30 C-8 20 -4 11 0 6 Z' },
        sword: { rot: -45, d: 'M0 0 L2 5 L2 22 L7 22 L7 25 L1 25 L1 32 L-1 32 L-1 25 L-7 25 L-7 22 L-2 22 L-2 5 Z' },
        dividers: { rot: -45, d: 'M0 0 L3 4 L6 22 L9 22 L12 4 L9 3 L6.5 17 L2.5 4 Z M4 22 H11 V26 H4 Z' },
        nib: { rot: -45, d: 'M0 0 L5 9 C6 14 5 19 0 24 C-5 19 -6 14 -5 9 Z' },
        arrow: { rot: 0, d: 'M2 2 L2 26 L8 20 L13 31 L17 29 L12 18 L20 18 Z' },
        'arrow-chunky': { rot: 0, d: 'M2 2 L2 28 L9 21 L14 31 L19 29 L14 19 L23 19 Z' },
        'arrow-future': { rot: 0, d: 'M2 2 L2 24 L7 19 L11 28 L15 26 L11 18 L18 18 Z M20 4 H28 V12' }
    };
    /** Datos del cursor de una epoca: { svg, x, y, point } (punta en x,y) o null si usa el del sistema. fill/stroke: relleno y contorno. */
    function cursorOf(glyph, fill, stroke) {
        const g = GLYPHS[glyph]; if (!g) return null;
        const body = g.rot === 0 ? '<path d="' + g.d + '"/>' : '<g transform="translate(5 5) rotate(' + g.rot + ')"><path d="' + g.d + '"/></g>';
        const tip = g.rot === 0 ? [2, 2] : [5, 5];
        const mk = (extra) => svg(36, 36, '<g fill="' + fill + '" stroke="' + stroke + '" stroke-width="2" stroke-linejoin="round" paint-order="stroke">' + body + '</g>' + extra);
        return { svg: mk(''), point: mk('<circle cx="29" cy="29" r="4" fill="none" stroke="' + fill + '" stroke-width="2"/>'), x: tip[0], y: tip[1] };
    }
    const cursorCss = (svgText, x, y, fallback) => 'url("data:image/svg+xml,' + encodeURIComponent(svgText) + '") ' + x + ' ' + y + ', ' + fallback;

    /* ---------------------------- Aplicacion ---------------------------- */
    /** Mezcla del color propio de un icono con el matiz de la epoca (el icono sigue siendo reconocible: amt <= 0.3). */
    function iconColor(base, era) { const t = era.icons.tint; return t.amt > 0 ? mix(base, t.color, t.amt) : base; }

    /**
     * Variables CSS (nombre -> valor) para una epoca, un tema y una intensidad (0 neutro, 1 sutil, 2 completa). Con 0 devuelve null: la pagina
     * quita todo lo suyo y vuelve al aspecto de siempre.
     */
    function cssVars(era, dark, level) {
        if (!era || !(level >= 1)) return null;
        const p = dark ? era.dark : era.light; const v = {};
        v['--bg'] = p.bg; v['--panel'] = rgba(p.panel, PANEL_ALPHA); v['--text'] = p.text; v['--muted'] = p.muted; v['--accent'] = p.accent;
        v['--ok'] = p.ok; v['--warn'] = p.warn; v['--err'] = p.err;
        // La letra de epoca solo en TITULOS; el texto corrido, siempre la del sistema (legible, con negrita y cursiva de verdad). El creador,
        // 2026-11-14: «no deberia estarse modificando la tipografia de TODO, sino solo de cosas especificas como titulos».
        v['--font'] = era.type.heading; v['--font-ui'] = READ_FONT;
        v['--h-weight'] = String(era.type.weight); v['--h-transform'] = era.type.transform; v['--h-spacing'] = era.type.spacing; v['--h-style'] = era.type.style;
        const full = level >= 2;
        v['--bstyle'] = full ? era.shape.border : 'solid'; v['--bw'] = (full ? era.shape.bw : 1) + 'px';
        v['--radius'] = (full ? era.shape.radius : 8) + 'px'; v['--btn-radius'] = (full ? era.shape.btnRadius : 6) + 'px';
        const o = era.ornament; const c = p.accent;
        const tl = full ? cornerOf(o.corner, c, false) : null; const br = full ? cornerOf(o.corner, c, true) : null;
        const dv = full ? dividerOf(o.divider, c) : null; const tx = full ? textureOf(o.texture, p.text) : null;
        v['--orn-tl'] = tl ? dataUrl(tl) : 'none'; v['--orn-br'] = br ? dataUrl(br) : 'none';
        // Sin texturas de fondo (puntos, cuadricula...): el creador, 2026-11-13: «mejor que no: ensucia». textureOf sigue para quien la quiera.
        v['--orn-divider'] = dv ? dataUrl(dv) : 'none'; v['--orn-texture'] = 'none'; void tx;
        v['--orn-divider-h'] = dv ? '6px' : '0px';
        const cur = full && era.cursor ? cursorOf(era.cursor, p.accent, dark ? '#0b0b0b' : '#ffffff') : null;
        v['--cursor-grab'] = cur ? cursorCss(cur.svg, cur.x, cur.y, 'grab') : 'grab';
        v['--cursor-point'] = cur ? cursorCss(cur.point, cur.x, cur.y, 'pointer') : 'pointer';
        v['--cursor-drag'] = cur ? v['--cursor-grab'] : 'grabbing';
        return v;
    }
    /** Paleta del mapa de la epoca (ocean, shelf, land, landLine, line) o null si la intensidad es < 2. */
    function mapPalette(era, dark, level) { return era && level >= 2 ? (dark ? era.map.dark : era.map.light) : null; }
    /** Estilo de los iconos de la epoca ({rim, tint}) o null si la intensidad es < 2. */
    function iconStyle(era, level) { return era && level >= 2 ? era.icons : null; }

    return { ERAS, SLOTS, GLYPHS, CORNERS, DIVIDERS, TEXTURES, byId, at, indexOf, lastYear, labelOf, noteOf, contrast, mix, toRgb, lum, rgba, PANEL_ALPHA,
        cornerOf, dividerOf, textureOf, cursorOf, cursorCss, dataUrl, iconColor, cssVars, mapPalette, iconStyle };
});
