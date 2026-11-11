#!/usr/bin/env node
// Pruebas de map/eras.js (plantilla de ambientacion por epoca). Sin red ni DOM.
'use strict';
const E = require('../map/eras.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? '  ok  ' : ' FALLO ') + name + (extra ? '  -> ' + extra : '')); };
const HEX = /^#[0-9a-f]{6}$/;
const eachEra = (fn) => { const bad = []; E.ERAS.forEach((e) => { const r = fn(e); if (r !== true) bad.push(e.id + (typeof r === 'string' ? ': ' + r : '')); }); return bad.length === 0 ? true : bad.join(' | '); };

/* ---------------------------- rangos ---------------------------- */
check('rangos: ids unicos, `from` estrictamente creciente, la primera empieza antes de todo y la ultima no acaba', () => {
    const ids = new Set(E.ERAS.map((e) => e.id)); if (ids.size !== E.ERAS.length) return 'ids repetidos';
    for (let i = 1; i < E.ERAS.length; i++) if (!(E.ERAS[i].from > E.ERAS[i - 1].from)) return 'no creciente en ' + E.ERAS[i].id;
    return E.ERAS[0].from <= -1e11 && E.lastYear(E.ERAS.length - 1) === Infinity;
});
check('at(): cada anio cae en una sola epoca y los limites son exactos (sin huecos ni solapes)', () => {
    for (let i = 0; i < E.ERAS.length; i++) {
        const e = E.ERAS[i];
        if (E.at(e.from).id !== e.id) return 'inicio de ' + e.id;
        if (i > 0 && E.at(e.from - 1).id !== E.ERAS[i - 1].id) return 'fin de ' + E.ERAS[i - 1].id;
        if (E.lastYear(i) !== Infinity && E.at(E.lastYear(i)).id !== e.id) return 'ultimo anio de ' + e.id;
    }
    return true;
});
check('at(): fechas conocidas', () => {
    const w = { [-4e9]: 'deep', [-100000]: 'paleolithic', [-6000]: 'neolithic', [-2500]: 'bronze', [-800]: 'iron', [-44]: 'classical', 0: 'classical', 800: 'earlymed', 1215: 'highmed', 1492: 'renaissance', 1789: 'enlightenment', 1850: 'industrial', 1939: 'modern', 2000: 'digital', 2026: 'digital', 3000: 'future' };
    const bad = Object.entries(w).filter(([y, id]) => E.at(Number(y)).id !== id).map(([y, id]) => y + ' -> ' + E.at(Number(y)).id + ' (esperaba ' + id + ')');
    return bad.length === 0 ? true : bad.join('; ');
});
check('at(): un anio invalido (NaN, undefined) da la epoca actual, no una al azar', () => E.at(NaN).id === 'digital' && E.at(undefined).id === 'digital' && E.at(Infinity).id === 'digital');
check('el 1939 de las pruebas de siempre es del siglo XX y el 2026 de hoy es digital', () => E.at(1939).id === 'modern' && E.at(2026).id === 'digital');

/* ---------------------------- plantilla completa ---------------------------- */
check('plantilla: todas las epocas rellenan todas las ranuras', () => eachEra((e) => E.SLOTS.every((s) => e[s] !== undefined) || 'falta una ranura'));
check('plantilla: nombre y nota en es y en', () => eachEra((e) => ['es', 'en'].every((l) => typeof e.name[l] === 'string' && e.name[l].length > 2 && typeof e.note[l] === 'string' && e.note[l].length > 5)));
check('plantilla: las edades dicen que son convenciones regionales (Bronce, Hierro, Medievales)', () => ['bronze', 'iron', 'earlymed', 'highmed', 'classical'].every((id) => /convenci|Europe|Eurasia|Greece|Grecia|region|regi/i.test(E.byId(id).note.es + E.byId(id).note.en)));
check('plantilla: colores todos #rrggbb', () => eachEra((e) => ['light', 'dark'].every((t) => ['bg', 'panel', 'text', 'muted', 'accent', 'ok', 'warn', 'err'].every((k) => HEX.test(e[t][k]))) && ['light', 'dark'].every((t) => ['ocean', 'shelf', 'land', 'landLine', 'line'].every((k) => HEX.test(e.map[t][k]))) && HEX.test(e.icons.rim) && HEX.test(e.icons.tint.color) && !('disc' in e.icons)));
check('tipografia: solo familias del sistema y acaba en una generica (nada de fuentes externas)', () => eachEra((e) => [e.type.heading, e.type.ui].every((f) => /(serif|sans-serif|monospace)\s*$/.test(f) && !/url\(|http|@import/i.test(f))));
check('forma: estilos de borde y medidas razonables (el borde doble necesita >= 3 px)', () => eachEra((e) => ['solid', 'double', 'ridge', 'dashed', 'dotted'].includes(e.shape.border) && e.shape.bw >= 1 && e.shape.bw <= 5 && e.shape.radius >= 0 && e.shape.radius <= 20 && e.shape.btnRadius >= 0 && e.shape.btnRadius <= 14 && (e.shape.border !== 'double' || e.shape.bw >= 3)));
check('ornamentos: cada esquina, filete y trama nombrados existen', () => eachEra((e) => !!(E.CORNERS[e.ornament.corner] && E.DIVIDERS[e.ornament.divider] && (e.ornament.texture === 'none' || E.TEXTURES[e.ornament.texture]))));
check('cursor: el glifo existe (o es null = el del sistema, solo en la epoca actual)', () => eachEra((e) => (e.cursor === null ? e.id === 'digital' : !!E.GLYPHS[e.cursor])));
check('iconos: la mezcla de matiz es suave (<= 0,3) para que cada icono siga siendo reconocible', () => eachEra((e) => e.icons.tint.amt >= 0 && e.icons.tint.amt <= 0.3));

/* ---------------------------- legibilidad ---------------------------- */
const panelOver = (p) => E.mix(p.bg, p.panel, E.PANEL_ALPHA);   // el panel es translucido: se evalua sobre el fondo de su propia paleta
check('contraste: texto, texto atenuado y acento sobre el panel >= 4,5:1 (WCAG AA), en claro y oscuro', () => eachEra((e) => {
    for (const t of ['light', 'dark']) { const p = e[t]; const pn = panelOver(p); for (const k of ['text', 'muted', 'accent']) { const c = E.contrast(p[k], pn); if (c < 4.5) return t + ' ' + k + ' ' + c.toFixed(2); } }
    return true;
}));
check('contraste: texto sobre el fondo de pagina >= 4,5:1 y el acento sobre el fondo >= 4,5 (texto de boton al pasar el cursor)', () => eachEra((e) => {
    for (const t of ['light', 'dark']) { const p = e[t]; if (E.contrast(p.text, p.bg) < 4.5) return t + ' texto/bg ' + E.contrast(p.text, p.bg).toFixed(2); if (E.contrast(p.accent, p.bg) < 4.5) return t + ' acento/bg ' + E.contrast(p.accent, p.bg).toFixed(2); }
    return true;
}));
check('contraste: ok, aviso y error >= 3:1 sobre el panel (bordes y estados)', () => eachEra((e) => {
    for (const t of ['light', 'dark']) { const p = e[t]; const pn = panelOver(p); for (const k of ['ok', 'warn']) if (E.contrast(p[k], pn) < 3) return t + ' ' + k + ' ' + E.contrast(p[k], pn).toFixed(2); if (E.contrast(p.err, pn) < 4.5) return t + ' err ' + E.contrast(p.err, pn).toFixed(2); }
    return true;
}));
check('contraste: el tema claro es claro y el oscuro es oscuro (fondo)', () => eachEra((e) => E.lum(e.light.bg) > 0.6 && E.lum(e.dark.bg) < 0.1));
check('mapa: la tierra se distingue del mar (>= 1,15:1) y la linea de costa/frontera contrasta con la tierra (>= 3:1)', () => eachEra((e) => {
    for (const t of ['light', 'dark']) { const m = e.map[t]; if (E.contrast(m.land, m.ocean) < 1.15) return t + ' tierra/mar ' + E.contrast(m.land, m.ocean).toFixed(2); if (E.contrast(m.line, m.land) < 3) return t + ' frontera/tierra ' + E.contrast(m.line, m.land).toFixed(2); }
    return true;
}));
check('iconos: el borde que sigue la silueta es claro (luminancia >= 0,6), para que el trazo de color se lea sobre mapas oscuros', () => eachEra((e) => E.lum(e.icons.rim) >= 0.6 || E.lum(e.icons.rim).toFixed(2)));

/* ---------------------------- "de un vistazo": epocas vecinas claramente distintas ---------------------------- */
const dist = (a, b) => { const x = E.toRgb(a), y = E.toRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
check('distintas: epocas consecutivas difieren en acento (>= 70 de distancia RGB) en claro y oscuro', () => {
    for (let i = 1; i < E.ERAS.length; i++) for (const t of ['light', 'dark']) { const d = dist(E.ERAS[i][t].accent, E.ERAS[i - 1][t].accent); if (d < 70) return E.ERAS[i - 1].id + ' / ' + E.ERAS[i].id + ' ' + t + ' ' + d.toFixed(0); }
    return true;
});
check('distintas: epocas consecutivas difieren tambien en ornamento (esquina o filete) y en cursor', () => {
    for (let i = 1; i < E.ERAS.length; i++) { const a = E.ERAS[i - 1], b = E.ERAS[i]; if (a.ornament.corner === b.ornament.corner && a.ornament.divider === b.ornament.divider) return 'ornamento igual en ' + b.id; if (a.cursor === b.cursor) return 'cursor igual en ' + b.id; }
    return true;
});
check('distintas: ninguna paleta de acento se repite entre dos epocas cualesquiera', () => { const seen = new Map(); for (const e of E.ERAS) { const k = e.light.accent; if (seen.has(k)) return seen.get(k) + ' y ' + e.id; seen.set(k, e.id); } return true; });

/* ---------------------------- SVG ---------------------------- */
const wellFormed = (s) => {
    if (typeof s !== 'string' || !s.startsWith('<svg ') || !s.endsWith('</svg>')) return 'no empieza/acaba en svg';
    if (/<script|href=|http:\/\/(?!www\.w3\.org\/2000\/svg)|https:|javascript:|onload|on[a-z]+=|<image|<foreignObject|<style/i.test(s)) return 'contenido no permitido';
    const tags = s.match(/<\/?([a-zA-Z]+)/g) || []; const allowed = new Set(['svg', 'path', 'circle', 'g']);
    for (const t of tags) if (!allowed.has(t.replace(/<\/?/, ''))) return 'etiqueta no permitida ' + t;
    const stack = []; for (const m of s.matchAll(/<(\/?)([a-z]+)([^>]*?)(\/?)>/g)) { if (m[1]) { if (stack.pop() !== m[2]) return 'cierre desparejado ' + m[2]; } else if (!m[4]) stack.push(m[2]); }
    if (stack.length) return 'etiquetas sin cerrar ' + stack.join(',');
    if (!/viewBox="0 0 \d+ \d+"/.test(s)) return 'sin viewBox';
    return true;
};
check('SVG: todas las esquinas, filetes y tramas son SVG bien formados y sin recursos externos', () => {
    const bad = [];
    Object.keys(E.CORNERS).forEach((k) => { [false, true].forEach((br) => { const r = wellFormed(E.cornerOf(k, '#336699', br)); if (r !== true) bad.push('esquina ' + k + ': ' + r); }); });
    Object.keys(E.DIVIDERS).forEach((k) => { const r = wellFormed(E.dividerOf(k, '#336699')); if (r !== true) bad.push('filete ' + k + ': ' + r); });
    Object.keys(E.TEXTURES).forEach((k) => { const r = wellFormed(E.textureOf(k, '#336699')); if (r !== true) bad.push('trama ' + k + ': ' + r); });
    return bad.length === 0 ? true : bad.join(' | ');
});
check('SVG: los cursores son SVG bien formados, caben en 36x36 y la punta (hotspot) esta dentro', () => {
    const bad = [];
    Object.keys(E.GLYPHS).forEach((g) => { const c = E.cursorOf(g, '#336699', '#ffffff'); if (!c) { bad.push(g + ' null'); return; } [c.svg, c.point].forEach((s) => { const r = wellFormed(s); if (r !== true) bad.push(g + ': ' + r); }); if (!(c.x >= 0 && c.x <= 12 && c.y >= 0 && c.y <= 12)) bad.push(g + ' hotspot'); });
    return bad.length === 0 ? true : bad.join(' | ');
});
check('SVG: un glifo desconocido no rompe (devuelve null)', () => E.cursorOf('no-existe', '#000000', '#ffffff') === null && E.cornerOf('no-existe', '#000000') === null);

/* ---------------------------- cssVars ---------------------------- */
const REQUIRED = ['--bg', '--panel', '--text', '--muted', '--accent', '--ok', '--warn', '--err', '--font', '--font-ui', '--h-weight', '--h-transform', '--h-spacing', '--h-style', '--bstyle', '--bw', '--radius', '--btn-radius', '--orn-tl', '--orn-br', '--orn-divider', '--orn-texture', '--orn-divider-h', '--cursor-grab', '--cursor-point', '--cursor-drag'];
check('cssVars: intensidad 0 (o invalida) no devuelve nada: se vuelve al aspecto de siempre', () => E.cssVars(E.at(1939), false, 0) === null && E.cssVars(E.at(1939), true, undefined) === null && E.cssVars(null, false, 2) === null);
check('cssVars: intensidad 1 y 2 devuelven todas las variables, como cadenas', () => [1, 2].every((lv) => [false, true].every((dk) => eachEra((e) => { const v = E.cssVars(e, dk, lv); return REQUIRED.every((k) => typeof v[k] === 'string' && v[k].length > 0); }) === true)));
check('cssVars: la sutil (1) deja neutros bordes, ornamentos, texturas y cursor; la completa (2) los pone', () => {
    const a = E.cssVars(E.byId('classical'), false, 1), b = E.cssVars(E.byId('classical'), false, 2);
    return a['--bstyle'] === 'solid' && a['--bw'] === '1px' && a['--orn-tl'] === 'none' && a['--orn-divider'] === 'none' && a['--orn-texture'] === 'none' && a['--cursor-grab'] === 'grab' && a['--cursor-drag'] === 'grabbing' && a['--accent'] === b['--accent']
        && b['--bstyle'] === 'double' && b['--orn-tl'].startsWith('url("data:image/svg+xml,') && b['--orn-divider'] !== 'none' && /^url\("data:image\/svg\+xml,[^"]+"\) \d+ \d+, grab$/.test(b['--cursor-grab']) && /, pointer$/.test(b['--cursor-point']);
});
check('cssVars: el panel sale como rgba con la opacidad de siempre y coincide con la paleta', () => { const v = E.cssVars(E.byId('bronze'), true, 2); const c = E.toRgb(E.byId('bronze').dark.panel); return v['--panel'] === 'rgba(' + c.join(', ') + ', ' + E.PANEL_ALPHA + ')'; });
check('cssVars: claro y oscuro dan paletas distintas de la misma epoca', () => eachEra((e) => E.cssVars(e, false, 2)['--bg'] !== E.cssVars(e, true, 2)['--bg']));
check('cssVars: la epoca actual sin cursor propio deja el del sistema', () => { const v = E.cssVars(E.byId('digital'), false, 2); return v['--cursor-grab'] === 'grab' && v['--cursor-point'] === 'pointer'; });
check('cssVars: ningun valor puede cerrar una declaracion CSS ni abrir otra (sin ";" ni "{" fuera de url)', () => eachEra((e) => { const v = E.cssVars(e, false, 2); return Object.keys(v).every((k) => !/[;{}]/.test(String(v[k]).replace(/url\("[^"]*"\)/g, ''))) || 'caracter prohibido'; }));
check('mapPalette / iconStyle: solo con la intensidad completa', () => E.mapPalette(E.byId('bronze'), false, 1) === null && E.mapPalette(E.byId('bronze'), false, 2).land === E.byId('bronze').map.light.land && E.mapPalette(E.byId('bronze'), true, 2).land === E.byId('bronze').map.dark.land
    && E.iconStyle(E.byId('bronze'), 1) === null && E.iconStyle(E.byId('bronze'), 2).rim === E.byId('bronze').icons.rim);
check('iconColor: mezcla suave hacia el matiz de la epoca y sin cambio con amt 0', () => {
    const e = E.byId('bronze'); const base = '#c62828'; const c = E.iconColor(base, e);
    return c !== base && /^#[0-9a-f]{6}$/.test(c) && E.iconColor(base, E.byId('digital')) === base && dist(c, base) < dist(e.icons.tint.color, base);
});

console.log(fails ? '\n' + fails + ' FALLO(S)' : '\nTodo en orden (epocas).');
process.exit(fails ? 1 : 0);
