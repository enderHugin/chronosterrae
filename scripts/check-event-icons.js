#!/usr/bin/env node
// Pruebas de map/event-icons.js (clasificacion, dibujos, animacion). Sin red. El aspecto real se comprueba en el render (probe-shot).
'use strict';
const fs = require('fs'); const path = require('path');
const I = require('../map/event-icons.js'); const Changes = require('../map/changes.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? '  ok  ' : ' FALLO ') + name + (extra ? '  -> ' + extra : '')); };
const cls = (...ids) => ids.map((id) => ({ id }));
const C = (p) => I.classify(p).icon;

// ---- Los QID de la tabla existen en los datos reales, con esa etiqueta (regla 1: nada de memoria)
const dir = path.join(__dirname, '..', 'data', 'events'); const real = new Map(); const used = new Map(); let events = 0;
for (const f of fs.readdirSync(dir).filter((n) => /^c\d+\.json$/.test(n))) {
    for (const x of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).features) {
        const p = x.properties; if (p.kind !== 'event') continue; events++;
        (p.classes || []).forEach((c) => { if (c.label !== undefined) real.set(c.id, c.label); used.set(c.id, (used.get(c.id) || 0) + 1); });
    }
}
check('hay datos reales contra los que contrastar (miles de sucesos)', () => events > 5000 ? true : events);
check('cada QID de ICON_CLASSES aparece en los datos con exactamente la etiqueta indicada', () => {
    const bad = Object.entries(I.ICON_CLASSES).filter(([id, [, label]]) => real.get(id) !== label).map(([id, [, label]]) => id + ' "' + label + '" vs "' + real.get(id) + '"');
    return bad.length === 0 ? true : bad.slice(0, 5).join(' | ');
});
check('ICON_CLASSES solo apunta a iconos que existen', () => Object.values(I.ICON_CLASSES).every(([icon]) => I.GLYPHS[icon] || icon === 'war'));
check('ningun QID esta a la vez en ICON_CLASSES y en CLASS_KINDS de changes.js (una sola fuente de verdad por QID)', () => Object.keys(I.ICON_CLASSES).every((id) => !Changes.CLASS_KINDS[id]));

// ---- Epoca: espada / mosquete / tanque
check('eraIcon: <1500 espada, 1500..1913 mosquete, >=1914 tanque (limites exactos)', () => I.eraIcon(1499) === 'sword' && I.eraIcon(1500) === 'musket' && I.eraIcon(1913) === 'musket' && I.eraIcon(1914) === 'tank' && I.eraIcon(-500) === 'sword' && I.eraIcon(2026) === 'tank');
check('eraIcon sin año valido cae en espada, no en NaN', () => I.eraIcon(NaN) === 'sword' && I.eraIcon(undefined) === 'sword');
check('guerra (Q198) medieval = espada; napoleonica = mosquete; 1939 = tanque', () => C({ kind: 'event', classes: cls('Q198'), year: 1066 }) === 'sword' && C({ kind: 'event', classes: cls('Q198'), year: 1805 }) === 'musket' && C({ kind: 'event', classes: cls('Q198'), year: 1939 }) === 'tank');
check('batalla (Q178561) y guerra de independencia (Q21994376) tambien por epoca', () => C({ kind: 'event', classes: cls('Q178561'), year: 1700 }) === 'musket' && C({ kind: 'event', classes: cls('Q21994376'), year: 1950 }) === 'tank');

// ---- Otras clases
const one = (qid, icon) => check('clase ' + qid + ' (' + I.ICON_CLASSES[qid][1] + ') -> ' + icon, () => C({ kind: 'event', classes: cls(qid), year: 1900 }) === icon);
one('Q1127126', 'union'); one('Q63442071', 'union'); one('Q47566', 'election'); one('Q744913', 'accident'); one('Q27020041', 'sport'); one('Q16913666', 'ceremony'); one('Q47150325', 'calendar'); one('Q8068', 'natural'); one('Q3882219', 'violence');
check('tratados (Q131569, de changes.js) -> pluma y papiro', () => C({ kind: 'event', classes: cls('Q131569'), year: 1648 }) === 'treaty');
check('politica/natural/violencia de changes.js', () => C({ kind: 'event', classes: cls('Q10931'), year: 1789 }) === 'political' && C({ kind: 'event', classes: cls('Q7944'), year: 1755 }) === 'natural' && C({ kind: 'event', classes: cls('Q3199915'), year: 1900 }) === 'violence');
check('gana la PRIMERA clase reconocida (alianza militar antes que tratado)', () => C({ kind: 'event', classes: cls('Q1127126', 'Q131569'), year: 1900 }) === 'union' && C({ kind: 'event', classes: cls('Q131569', 'Q1127126'), year: 1900 }) === 'treaty');
check('se salta clases desconocidas hasta dar con una conocida', () => C({ kind: 'event', classes: cls('Q999999999', 'Q131569'), year: 1900 }) === 'treaty');
check('clases que la fuente da y no tienen dibujo -> icono generico (y NO se deduce del nombre)', () => {
    const r = I.classify({ kind: 'event', name: 'Battle of Nothing', classes: cls('Q999999999'), year: 1500 }); return r.icon === 'event' && r.source === 'default' ? true : JSON.stringify(r);
});
check('origen: wikidata cuando hay clase, name cuando se deduce del nombre, kind para el resto', () => {
    return I.classify({ kind: 'event', classes: cls('Q198'), year: 900 }).source === 'wikidata' && I.classify({ kind: 'event', name: 'Battle of Hastings', year: 1066 }).source === 'name' && I.classify({ kind: 'birth' }).source === 'kind';
});
check('sin clases, el nombre en ingles decide (batalla medieval = espada, tratado = pluma)', () => C({ kind: 'event', name: 'Battle of Hastings', year: 1066 }) === 'sword' && C({ kind: 'event', name: 'Treaty of Tordesillas', year: 1494 }) === 'treaty' && C({ kind: 'event', name: 'Siege of Vienna', year: 1683 }) === 'musket');
check('sin clases y sin pista en el nombre -> generico', () => C({ kind: 'event', name: 'Something happened', year: 1900 }) === 'event' && C({ kind: 'event', year: 1900 }) === 'event');
check('los tipos de registro tienen su icono: nacimiento, muerte, obra, composicion, descubrimiento, extincion', () => ['birth', 'death', 'publication', 'composition', 'discovery', 'extinction'].every((k) => C({ kind: k }) === k));
check('un tipo de registro desconocido o entradas absurdas no rompen (rechazado, no roto)', () => C({ kind: 'zzz' }) === 'event' && C(null) === 'event' && C(undefined) === 'event' && C({ kind: 'event', classes: [null, undefined, {}], year: 1900 }) === 'event' && C({ kind: 'event', classes: 'Q198' }) === 'event');
check('para un tipo que no es «suceso» no se usan las clases', () => C({ kind: 'birth', classes: cls('Q198') }) === 'birth');

// ---- Todos los datos reales se clasifican a un icono con dibujo
check('todo suceso real recibe un icono con dibujo (y se reparte en varios tipos)', () => {
    const seen = new Map(); let bad = 0;
    for (const f of fs.readdirSync(dir).filter((n) => /^c\d+\.json$/.test(n))) {
        for (const x of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).features) {
            const p = x.properties; const y = Changes.eventYears(x).from;
            const r = I.classify({ kind: p.kind, name: p.name, classes: p.classes, year: y });
            if (!I.GLYPHS[r.icon]) bad++; seen.set(r.icon, (seen.get(r.icon) || 0) + 1);
        }
    }
    return bad === 0 && seen.size >= 15 ? true : bad + ' sin dibujo; tipos=' + seen.size + ' ' + JSON.stringify([...seen]);
});

// ---- Dibujos
check('hay un dibujo, un color y un grupo de animacion para cada icono (y ningun color suelto)', () => I.KEYS.length >= 20 && I.KEYS.every((k) => /^#[0-9a-f]{6}$/i.test(I.COLORS[k]) && (I.animGroup(k) === 'bob' || I.animGroup(k) === 'shake')) && Object.keys(I.COLORS).every((k) => I.GLYPHS[k]));
check('los iconos pedidos existen: espada, mosquete, tanque, pluma y papiro (treaty), anillos (union)', () => ['sword', 'musket', 'tank', 'treaty', 'union'].every((k) => I.GLYPHS[k]));
check('todas las rutas estan bien formadas y caben en la caja 24x24 (margen para el borde)', () => {
    const bad = [];
    for (const k of I.KEYS) for (const p of I.GLYPHS[k]) {
        try {
            const b = I.pathBox(p.d); const m = p.r ? 6 : 0.5;           // las rotadas giran sobre el centro: se admite mas holgura en su caja sin girar
            if (b.minX < -m || b.minY < -m || b.maxX > 24 + m || b.maxY > 24 + m || !Number.isFinite(b.minX)) bad.push(k + ' ' + JSON.stringify(b));
        } catch (e) { bad.push(k + ': ' + e.message); }
    }
    return bad.length === 0 ? true : bad.slice(0, 4).join(' | ');
});
check('pathBox rechaza rutas rotas (no es lo mismo que una ruta fuera de caja)', () => {
    const rej = (d) => { try { I.pathBox(d); return false; } catch (e) { return true; } };
    return rej('') && rej('L1 1') && rej('M1') && rej('M1 1 Q2 2 3 3') && rej('M1 1 A2 2 0 2 0 3 3') && rej('M1 1 L2 2 3') ? true : 'alguna ruta rota se acepto';
});
check('pathBox acepta rutas validas y calcula su caja', () => { const b = I.pathBox('M2 3 h4 v5 H1 Z'); return b.minX === 1 && b.maxX === 6 && b.minY === 3 && b.maxY === 8 ? true : JSON.stringify(b); });
check('cada parte tiene un tipo valido y los trazos tienen grosor razonable', () => I.KEYS.every((k) => I.GLYPHS[k].every((p) => 'fklscd'.includes(p.t) && p.t.length === 1 && (!p.w || (p.w > 0 && p.w <= 4)))));
check('cada icono tiene al menos una parte con color propio (no es solo detalle claro)', () => I.KEYS.every((k) => I.GLYPHS[k].some((p) => 'fs'.includes(p.t))));

// ---- draw() con un contexto falso: primero el borde blanco, luego el color
function fakeCtx() {
    const calls = []; const ctx = { calls };
    for (const m of ['save', 'restore', 'beginPath', 'clip']) ctx[m] = () => calls.push(m);
    for (const m of ['translate', 'scale', 'rotate', 'rect']) ctx[m] = (...a) => calls.push(m + ':' + a.join(','));
    ctx.stroke = () => calls.push('stroke:' + ctx.strokeStyle + ':' + ctx.lineWidth); ctx.fill = () => calls.push('fill:' + ctx.fillStyle);
    return ctx;
}
class FakePath { constructor(d) { if (typeof d !== 'string') throw new Error('d'); I.pathBox(d); this.d = d; } }
check('draw pinta el borde blanco antes que el relleno y termina con save/restore equilibrados', () => {
    const c = fakeCtx(); I.draw(c, 'sword', 48, { Path2D: FakePath });
    const firstFill = c.calls.findIndex((s) => s.startsWith('fill:')); const lastWhite = c.calls.map((s, i) => (s.startsWith('stroke:#ffffff') ? i : -1)).filter((i) => i >= 0).pop();
    const saves = c.calls.filter((s) => s === 'save').length; const restores = c.calls.filter((s) => s === 'restore').length;
    return firstFill > lastWhite && lastWhite >= 0 && saves === restores && c.calls.some((s) => s === 'fill:' + I.COLORS.sword) ? true : JSON.stringify(c.calls.slice(0, 12));
});
check('draw funciona para TODOS los iconos con un color propio', () => I.KEYS.every((k) => { const c = fakeCtx(); I.draw(c, k, 32, { Path2D: FakePath, color: '#123456' }); return c.calls.some((s) => s === 'fill:#123456' || s === 'stroke:#123456:' + (c.calls.length >= 0 ? s.split(':')[2] : '')); }));
check('draw con icono desconocido o sin Path2D lanza un error claro', () => {
    let a = false; let b = false;
    try { I.draw(fakeCtx(), 'zzz', 24, { Path2D: FakePath }); } catch (e) { a = /desconocido/.test(e.message); }
    try { I.draw(fakeCtx(), 'sword', 24, {}); } catch (e) { b = /Path2D/.test(e.message); }
    return a && b;
});
check('shade oscurece y aclara', () => I.shade('#808080', -0.5) === '#404040' && I.shade('#000000', 1) === '#ffffff');

// ---- Entrada animada
const parts = (k) => I.GLYPHS[k].length;
check('en t >= 1 (y con t invalido) la entrada es la identidad para todas las partes de todos los iconos', () => I.KEYS.every((k) => I.GLYPHS[k].every((_, i) => [1, 1.5, NaN].every((t) => { const p = I.enterParams(k, t, i); return p.dx === 0 && p.dy === 0 && p.rot === 0 && p.sx === 1 && p.sy === 1 && p.a === 1 && p.clip === null; }))));
check('en t = 0 todos los iconos arrancan distintos del dibujo final (algo se mueve, crece o aparece)', () => I.KEYS.every((k) => I.GLYPHS[k].some((_, i) => { const p = I.enterParams(k, 0, i); return p.dx !== 0 || p.dy !== 0 || p.rot !== 0 || p.sx !== 1 || p.sy !== 1 || p.a !== 1 || p.clip !== null; })));
check('los parametros de entrada son finitos y acotados (gesto sobrio: nada sale disparado ni gira mas de 60°)', () => {
    for (const k of I.KEYS) for (let i = 0; i < parts(k); i++) for (let f = 0; f < I.ENTER_FRAMES; f++) {
        const p = I.enterParams(k, f / (I.ENTER_FRAMES - 1), i);
        const nums = [p.dx, p.dy, p.rot, p.sx, p.sy, p.a, p.pv[0], p.pv[1]];
        if (!nums.every(Number.isFinite) || Math.abs(p.dx) > 20 || Math.abs(p.dy) > 20 || Math.abs(p.rot) > 60 || p.sx < 0 || p.sx > 1.1 || p.sy < 0 || p.sy > 1.1 || p.a < 0 || p.a > 1) return k + ' parte ' + i + ' f' + f + ' ' + JSON.stringify(p);
    }
    return true;
});
check('la opacidad de cada parte nunca baja mientras avanza la entrada (aparece, no parpadea)', () => I.KEYS.every((k) => I.GLYPHS[k].every((_, i) => { let prev = -1; for (let f = 0; f < I.ENTER_FRAMES; f++) { const a = I.enterParams(k, f / (I.ENTER_FRAMES - 1), i).a; if (a < prev - 1e-9) return false; prev = a; } return true; })));
check('el desplazamiento y el giro se acercan monotonamente al reposo (sin vaivenes), salvo el asentamiento minimo de las espadas', () => {
    for (const k of I.KEYS) { if (k === 'sword') continue; for (let i = 0; i < parts(k); i++) { let prev = Infinity; for (let f = 0; f < I.ENTER_FRAMES; f++) { const p = I.enterParams(k, f / (I.ENTER_FRAMES - 1), i); const m = Math.abs(p.dx) + Math.abs(p.dy) + Math.abs(p.rot); if (m > prev + 1e-9) return k + ' f' + f; prev = m; } } }
    return true;
});
check('espadas: se cruzan (giro adicional se reduce a 0) con un asentamiento de menos del 6 % del recorrido', () => {
    const rots = []; for (let f = 0; f < I.ENTER_FRAMES; f++) rots.push(I.enterParams('sword', f / (I.ENTER_FRAMES - 1), 0).rot);
    const over = Math.max(...rots.map((r) => (r > 0 ? r : 0))); return rots[0] < -20 && rots[rots.length - 1] === 0 && over < 0.06 * 44 ? true : rots.join();
});
check('lapida: emerge de la tierra, recortada por la linea del suelo (clip) hasta llegar', () => { const a = I.enterParams('death', 0.5, 0); const z = I.enterParams('death', 1, 0); return a.clip === 21.5 && a.dy > 0 && z.clip === null && z.dy === 0; });
check('la ultima fotografia de la entrada (t=1) emite exactamente las mismas operaciones que el dibujo estatico', () => I.KEYS.every((k) => { const a = fakeCtx(); I.draw(a, k, 48, { Path2D: FakePath, x: 4, y: 4 }); const b = fakeCtx(); I.draw(b, k, 48, { Path2D: FakePath, x: 4, y: 4, t: 1 }); return JSON.stringify(a.calls) === JSON.stringify(b.calls); }));
check('draw con cualquier fotograma de la entrada funciona, termina equilibrado y distinto del final para los intermedios', () => I.KEYS.every((k) => {
    const fin = JSON.stringify((() => { const c = fakeCtx(); I.draw(c, k, 48, { Path2D: FakePath }); return c.calls; })());
    return Array.from({ length: I.ENTER_FRAMES }, (_, f) => f / (I.ENTER_FRAMES - 1)).every((t) => {
        const c = fakeCtx(); I.draw(c, k, 48, { Path2D: FakePath, t }); const sv = c.calls.filter((x) => x === 'save').length; const rs = c.calls.filter((x) => x === 'restore').length;
        return sv === rs && (t === 1 || JSON.stringify(c.calls) !== fin);
    });
}));
check('la entrada dura entre 0,8 y 1,5 s y se reparte en 8-12 fotogramas', () => I.ENTER_MS >= 800 && I.ENTER_MS <= 1500 && I.ENTER_FRAMES >= 8 && I.ENTER_FRAMES <= 12);
check('t negativo o texto no rompen el dibujo (se trata como el inicio)', () => { const c = fakeCtx(); I.draw(c, 'tank', 48, { Path2D: FakePath, t: -3 }); const d = fakeCtx(); I.draw(d, 'tank', 48, { Path2D: FakePath, t: 'x' }); return c.calls.length > 0 && d.calls.length > 0; });

// ---- Animacion
function clock() { let now = 0; let seq = 1; const t = new Map(); return { setTimer: (fn, ms) => { const h = seq++; t.set(h, { at: now + ms, fn }); return h; }, clearTimer: (h) => t.delete(h), tick(ms) { const end = now + ms; for (;;) { let b = null; for (const [h, x] of t) if (x.at <= end && (!b || x.at < b.x.at)) b = { h, x }; if (!b) break; now = b.x.at; t.delete(b.h); b.x.fn(); } now = end; }, pending: () => t.size }; }
check('el metronomo alterna 1,0,1,0 cada periodo y para limpio', () => {
    const c = clock(); const ph = []; const p = I.createPulse({ period: 1000, setTimer: c.setTimer, clearTimer: c.clearTimer, apply: (v) => ph.push(v) });
    p.start(); c.tick(3500); const a = ph.join(); p.stop(); return a === '1,0,1' && c.pending() === 0 && !p.running() && ph.join() === '1,0,1,0' ? true : a + ' / ' + ph.join();
});
check('si no esta habilitado no cambia de fase, pero sigue vivo y reanuda', () => {
    const c = clock(); let on = false; const ph = []; const p = I.createPulse({ period: 1000, setTimer: c.setTimer, clearTimer: c.clearTimer, enabled: () => on, apply: (v) => ph.push(v) });
    p.start(); c.tick(5000); const a = ph.length === 0; on = true; c.tick(1000); return a && ph.join() === '1' && p.running();
});
check('start dos veces no duplica temporizadores', () => { const c = clock(); const p = I.createPulse({ period: 1000, setTimer: c.setTimer, clearTimer: c.clearTimer }); return p.start() === true && p.start() === false && c.pending() === 1; });
check('stop deja la fase en reposo (0) aunque estuviera en 1', () => {
    const c = clock(); const ph = []; const p = I.createPulse({ period: 1000, setTimer: c.setTimer, clearTimer: c.clearTimer, apply: (v) => ph.push(v) }); p.start(); c.tick(1000); p.stop(); return ph.join() === '1,0' && p.phase() === 0;
});

console.log(fails ? '\n' + fails + ' FALLO(S)' : '\nTodo en orden (event-icons).');
process.exit(fails ? 1 : 0);
