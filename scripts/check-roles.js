#!/usr/bin/env node
// check-roles.js - Iconos de personaje (corona, mitra, libreta y pluma...): reglas de eleccion del papel (scripts/build-roles.js), dibujos
// (map/event-icons.js, ROLE_GLYPHS) y forma de data/people/roles.json si existe. Sin red.
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./build-roles.js');
const I = require('../map/event-icons.js');

let fails = 0; const passes = [];
function check(name, fn) { let ok = false, err = ''; try { const r = fn(); ok = r === true; if (!ok) err = ' -> ' + JSON.stringify(r).slice(0, 400); } catch (e) { err = ' (' + e.message + ')'; } if (ok) passes.push(name); else { fails++; console.log('  XX  ' + name + err); } }
const S = (...a) => new Set(a);
const pick = (c, d, o) => { const p = R.pickRole(c, d, o); return p && p.role; };

/* ---------- eleccion del papel ---------- */
check('los papeles del build y los dibujos son los mismos (ni sobra ni falta ninguno)', () => JSON.stringify(R.ROLES.map((r) => r[0]).sort()) === JSON.stringify(I.ROLE_IDS.slice().sort()) || [R.ROLES.map((r) => r[0]), I.ROLE_IDS]);
check('cada papel tiene al menos una clase raiz (QID + etiqueta esperada) y palabras para la descripcion', () => R.ROLES.every(([r, roots, words]) => roots.length && roots.every(([q, l]) => /^Q\d+$/.test(q) && l) && words.length));
check('varias ocupaciones: gana la que la descripcion nombra antes (Goethe escritor; Churchill politico)', () => pick(S('writer', 'politician', 'scientist'), 'German writer, artist, natural scientist and politician (1749–1832)') === 'writer' && pick(S('writer', 'politician'), 'British statesman, soldier and writer (1874–1965)') === 'politician');
check('papa manda siempre (Pedro: «apostle of Jesus Christ», primer papa)', () => pick(S('religious', 'pope', 'monarch'), 'apostle of Jesus Christ') === 'pope');
check('monarca manda si lo fue Y su descripcion lo nombra (Napoleon emperador, aunque diga antes «military leader»)', () => pick(S('military', 'monarch', 'politician'), 'French military leader, French Emperor 1804–1814 and again in 1815') === 'monarch');
check('el cargo de monarca sin que la descripcion lo nombre no gana (presidente de Francia = copríncipe de Andorra: Poincare es politico)', () => pick(S('politician', 'monarch'), 'French politician, President of France (1860–1934)') === 'politician');
check('realeza sin cargo de monarca, por su descripcion (reina consorte, principe)', () => pick(S('actor', 'writer'), 'Queen consort of Spain') === 'monarch' && pick(undefined, 'Portuguese prince and explorer') === 'monarch');
check('«drag queen» no es realeza', () => pick(S('actor', 'musician'), 'American drag queen and television personality') !== 'monarch' && pick(undefined, 'American drag queen') === null);
check('sin pista en la descripcion: la primera ocupacion de Wikidata (Leonardo «polymath»: pintor, no compositor)', () => pick(S('painter', 'composer', 'scientist'), 'Italian Renaissance polymath (1452−1519)', ['painter', 'scientist', 'composer']) === 'painter');
check('sin pista y sin orden: la reserva FALLBACK (y la via lo dice)', () => { const p = R.pickRole(S('athlete', 'composer'), ''); return (p.role === 'composer' && p.via === 'prioridad') || p; });
check('sin pista y sin orden: lo publico antes que el oficio (Jamenei: politica, no ciencia; un clerigo-cientifico: religion)', () => pick(S('scientist', 'politician', 'religious', 'writer'), 'Supreme Leader of Iran since 1989') === 'politician' && pick(S('scientist', 'religious'), '') === 'religious' && pick(S('scientist', 'politician', 'writer'), 'Iranian figure') === 'politician');
check('«leader» es politica, salvo que antes diga otra cosa («religious leader», «military leader»)', () => pick(S('politician', 'religious'), 'Iranian religious leader') === 'religious' && pick(S('politician', 'military'), 'Mongol military leader') === 'military' && pick(S('politician', 'religious'), 'Supreme Leader of Iran') === 'politician');
check('oficio que no es de los nuestros: sin papel, no se adivina por las ocupaciones (Bezos, Buffett, un asesino en serie, Snowden)', () =>
    pick(S('inventor', 'scientist'), 'American business magnate (born 1964)') === null && pick(S('scientist'), 'American investor, entrepreneur and businessman') === null
    && pick(S('scientist'), 'American serial killer (1946–1989)') === null && pick(S('scientist'), 'American whistleblower and former NSA contractor') === null
    && pick(S('scientist'), 'Indian-American business executive, CEO of Google LLC') === null);
check('si la descripcion nombra un papel suyo, el oficio ajeno no lo quita («American businessman and politician»: politica)', () => pick(S('politician'), 'American businessman and politician') === 'politician');
check('cargos politicos y diplomaticos: Kofi Annan, secretario del Tesoro, la OMC (antes «ciencia» por «economist»)', () =>
    pick(S('scientist', 'politician'), '7th Secretary-General of the United Nations (1938-2018)') === 'politician' && pick(S('scientist', 'politician'), '78th United States Secretary of the Treasury') === 'politician'
    && pick(S('scientist', 'politician'), 'director-General of the World Trade Organization') === 'politician');
check('«general» de «Secretary-General» o «attorney general» no es militar; «chief executive officer» tampoco', () =>
    pick(S('military', 'politician'), 'Secretary-General of NATO') === 'politician' && pick(S('military', 'politician'), 'United States Attorney General') === 'politician' && pick(S('military'), 'former chief executive officer of a bank') === null);
check('revolucionario: politica si lo es; militar si no (Che Guevara; antes «ciencia» por medico)', () =>
    pick(S('politician', 'military'), 'Hungarian Communist revolutionary and politician') === 'politician' && pick(S('military', 'scientist'), 'Argentine Marxist revolutionary (1928–1967)') === 'military');
check('astronautas y alpinistas: exploracion aunque Wikidata no les ponga «explorer»', () => pick(S('military'), 'American astronaut (1930–2021)') === 'explorer' && pick(S('scientist', 'actor'), 'American doctor and NASA astronaut') === 'explorer' && pick(S('explorer', 'athlete'), 'New Zealand mountaineer and philanthropist') === 'explorer');
check('cualquier «-ologo» es ciencia (fisiologo, oftalmologo), pero no el teologo', () => { const p = R.pickRole(S('scientist', 'politician'), 'English physiologist and biophysicist'); return p.role === 'scientist' && p.via === 'descripcion' && pick(S('scientist', 'religious'), 'German theologian') === 'religious'; });
check('palabras genericas no quitan el papel: Geronimo («leader of the Bedonkohe Apache») militar; «Pope of Alexandria» religion', () => pick(S('military'), 'leader of the Bedonkohe Apache (1829-1909)') === 'military' && pick(S('religious', 'writer'), 'Pope of Alexandria from 328 to 373') === 'religious');
check('director: de cine si; «Director of the National Institute» no (Fauci sigue en ciencia)', () => pick(S('actor', 'writer'), 'Swedish director and screenwriter') === 'actor' && pick(S('scientist'), '5th Director of the National Institute of Allergy and Infectious Diseases') === 'scientist');
check('«sitar player» es musica y «recording artist» tambien, no deporte ni pintura', () => pick(S('musician', 'composer', 'politician'), 'Indian sitar player (1920–2012)') === 'musician' && pick(S('actor', 'musician'), 'Brazilian recording artist and singer') === 'musician');
check('«social reformer» no es pista de religion (Florence Nightingale); «Protestant reformer» si', () => R.pickRole(S('writer', 'religious'), 'English social reformer, statistician').via !== 'descripcion' && pick(S('writer'), 'English social reformer, statistician, and founder of modern nursing') === 'writer' && R.pickRole(S('writer', 'religious'), 'German Protestant reformer').role === 'religious' && R.pickRole(S('writer', 'religious'), 'German Protestant reformer').via === 'descripcion');
check('los economistas ya no son ciencia (el matraz es para las ciencias naturales y la medicina)', () => !R.ROLES.find((r) => r[0] === 'scientist')[1].some(([q]) => q === 'Q188094') && pick(S('scientist', 'philosopher'), 'Scottish economist and philosopher') === 'philosopher');
check('editor o editorial: elige escritura si la tiene (Assange; antes «ciencia»), pero no quita otro papel (Hearst sigue en politica)', () => pick(S('scientist', 'writer', 'inventor', 'actor'), 'Australian editor, publisher, and activist (born 1971)') === 'writer' && pick(S('politician'), 'American newspaper publisher (1863–1951)') === 'politician');
check('la reserva cubre todos los papeles', () => R.FALLBACK.length === R.ROLES.length && R.ROLES.every(([r]) => R.FALLBACK.includes(r)));
check('palabras enteras: «poetry» no es «poet», «kingdom» no es «king»; el plural si cuenta (painters)', () => pick(S('writer', 'politician'), 'kingdom politician known for poetry') === 'politician' && pick(S('painter', 'writer'), 'one of the painters of the school and writer') === 'painter');
check('evangelistas y apostoles son religion (no pintura por defecto)', () => pick(S('painter', 'writer', 'religious'), 'one of the four evangelists') === 'religious');
check('sin candidatos y sin realeza: sin papel (cochecito o lapida de siempre)', () => R.pickRole(undefined, 'American author') === null && R.pickRole(new Set(), '') === null);
check('las personas conocidas para revisar llevan papel esperado valido', () => R.KNOWN.every(([q, l, r]) => /^Q\d+$/.test(q) && l && I.ROLE_IDS.includes(r)));

/* ---------- dibujos ---------- */
check('drawKey: solo nacimientos y muertes con papel conocido llevan dibujo de papel', () => I.drawKey('birth', 'monarch') === 'birth.monarch' && I.drawKey('death', 'pope') === 'death.pope' && I.drawKey('treaty', 'monarch') === 'treaty' && I.drawKey('birth', 'zzz') === 'birth' && I.drawKey('birth', null) === 'birth');
check('glyphOf/hasGlyph: claves simples y compuestas; una compuesta rara no existe (rechazado, no roto)', () => I.hasGlyph('birth') && I.hasGlyph('death.writer') && !I.hasGlyph('war.writer') && !I.hasGlyph('birth.zzz') && !I.hasGlyph('') && !I.hasGlyph(undefined));
check('cada papel: rutas bien formadas que caben en la caja 24x24 con su borde', () => {
    const bad = [];
    I.ROLE_IDS.forEach((r) => I.ROLE_GLYPHS[r].forEach((p) => {
        try { const b = I.pathBox(p.d); const m = 0.6; if (b.minX < -m || b.minY < -m || b.maxX > 24 + m || b.maxY > 24 + m) bad.push(r + ' ' + JSON.stringify(b)); } catch (e) { bad.push(r + ': ' + e.message); }
        if (!'fklscd'.includes(p.t) || (p.w && !(p.w > 0 && p.w < 4))) bad.push(r + ' tipo/grosor ' + p.t + ' ' + p.w);
    }));
    return bad.length === 0 || bad.slice(0, 4);
});
check('todos los papeles se distinguen: ningun par de dibujos es igual', () => { const k = I.ROLE_IDS.map((r) => JSON.stringify(I.ROLE_GLYPHS[r])); return new Set(k).size === k.length; });
check('escritor y compositor: misma libreta y pluma; el compositor lleva pentagrama y una corchea (relleno) que el escritor no tiene', () => {
    const w = I.ROLE_GLYPHS.writer; const c = I.ROLE_GLYPHS.composer;
    return w[0].d === c[0].d && w[w.length - 2].d === c[c.length - 2].d && c.filter((p) => p.t === 'f').length === w.filter((p) => p.t === 'f').length + 1;
});
// lienzo falso: registra colores para comprobar que el dibujo usa el color del icono base
const fakeCtx = () => { const calls = []; const o = { calls, save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, beginPath() {}, rect() {}, clip() {}, stroke() { calls.push('s:' + o.strokeStyle); }, fill() { calls.push('f:' + o.fillStyle); } }; return o; };
function FakePath() {}
check('el dibujo de papel lleva el color de nacer (cian) o morir (gris) y el borde negro', () => I.ROLE_KEYS.every((k) => {
    const c = fakeCtx(); I.draw(c, k, 32, { Path2D: FakePath }); const col = I.COLORS[k.split('.')[0]];
    return c.calls.some((x) => x === 's:' + col || x === 'f:' + col) && c.calls.some((x) => x === 's:' + I.HALO);
}));
check('entrada animada de las personas con papel: arranca distinta, termina en el dibujo final y la opacidad no baja', () => I.ROLE_KEYS.every((k) => {
    const parts = I.glyphOf(k); const start = parts.some((_, i) => { const p = I.enterParams(k, 0, i); return p.a < 1 || p.dy !== 0 || p.sx !== 1; });
    const end = parts.every((_, i) => { const p = I.enterParams(k, 1, i); return p.a === 1 && p.dy === 0 && p.sx === 1 && p.sy === 1; });
    const mono = parts.every((_, i) => { let prev = -1; for (let f = 0; f <= 10; f++) { const a = I.enterParams(k, f / 10, i).a; if (a < prev - 1e-9) return false; prev = a; } return true; });
    return start && end && mono;
}));
check('el grupo del filtro, el color de los puntos y la animacion siguen siendo los de nacer/morir (la clave compuesta no los cambia)', () => I.groupOf('birth') === 'birth' && I.animGroup('birth') === 'bob' && I.KEYS.indexOf('birth.monarch') < 0);
check('ROLES: nombres en los dos idiomas, sin genero en español (ambito, no profesion)', () => I.ROLES.every((r) => r.es && r.en && !/(or|ora|ero|era)$/.test(r.es)));

/* ---------- datos publicados ---------- */
const file = path.join(__dirname, '..', 'data', 'people', 'roles.json');
if (fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('roles.json: papel -> lista de QID numericos, solo papeles con dibujo y sin persona repetida', () => {
        const seen = new Set(); let dup = 0;
        const ok = Object.entries(j.roles).every(([r, list]) => I.ROLE_GLYPHS[r] && Array.isArray(list) && list.every((n) => { if (seen.has(n)) dup++; seen.add(n); return Number.isInteger(n) && n > 0; }));
        return (ok && dup === 0 && seen.size > 1000) || { ok, dup, n: seen.size };
    });
    check('roles.json: Albert Einstein es ciencia y Mozart composicion (si estan en los datos)', () => { const has = (r, q) => (j.roles[r] || []).includes(q); return has('scientist', 937) && has('composer', 254); });
}

console.log('\nPASS ' + passes.length); passes.forEach((p) => console.log('  ok  ' + p));
if (fails) { console.log('\nFAIL ' + fails); process.exit(1); } else console.log('\nPersonajes: todo verde.');
