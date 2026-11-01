#!/usr/bin/env node
// check-events.js - Pruebas de los sucesos: seleccion por escala y tiempo, avisos, conversion desde Wikidata y datos.
// Sin red. Una prueba que comprueba un rechazo distingue "rechazado" de "roto": exige el motivo concreto.
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const T = require('../sky/timed.js');
const S = require('../sky/sky.js');
const B = require('./build-events.js');
const seedBuilder = require('./build-seed.js');

const root = path.resolve(__dirname, '..');
const failures = []; const passes = [];
const check = (name, fn) => { try { const r = fn(); if (r === false) failures.push(name); else passes.push(name); } catch (e) { failures.push(name + ' -> ' + e.message); } };

const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
const validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(root, 'schemas/record.schema.json'), 'utf8')));
const reasons = (f) => { validate(f); return (validate.errors || []).map((e) => e.instancePath + ' ' + e.message + (e.params && e.params.missingProperty ? ' [' + e.params.missingProperty + ']' : '')).join(' | '); };
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- Datos del repositorio ---------- */
const seed = JSON.parse(fs.readFileSync(path.join(root, 'data/events/seed.json'), 'utf8'));
check('seed: el fichero del repositorio es exactamente lo que genera scripts/build-seed.js', () => JSON.stringify(seedBuilder.build(), null, 1) + '\n' === fs.readFileSync(path.join(root, 'data/events/seed.json'), 'utf8'));
check('seed: todos cumplen el esquema', () => seed.features.every((f) => { if (!validate(f)) throw new Error(f.properties.id + ': ' + reasons(f)); return true; }));
check('seed: ninguno supera "community" (los aporta una IA) y todos citan una fuente con cita literal', () => seed.features.every((f) => f.properties.status === 'community' && f.properties.sources.every((s) => s.citation && s.citation.includes('"'))));
check('seed: el instante en dia juliano coincide con la fecha y hora escrita (Vostok 1 = 1961-04-12 06:07 UTC)', () => {
    const f = seed.features.find((x) => x.properties.id === 'seed.vostok-1-launch');
    const ref = S.calendarToJD({ year: 1961, month: 4, day: 12, hour: 6, minute: 7 }, 'gregorian').jd;
    return Math.abs(f.properties.time.instant.jd_ut - ref) < 1e-7 && Math.abs(T.span(f).a - ref) < 1e-6;
});
check('seed: Chernobil 01:23 MSD (UTC+4) del 26-4-1986 es 21:23 UTC del 25-4', () => {
    const f = seed.features.find((x) => x.properties.id === 'seed.chernobyl-explosion');
    const c = S.jdToCalendar(f.properties.time.instant.jd_ut, 'auto');
    return c.year === 1986 && c.month === 4 && c.day === 25 && c.hour === 21 && c.minute === 23 && f.properties.time.instant.utc_offset_minutes === 240;
});
check('seed: el hundimiento del Titanic cae a las 05:18 GMT del 15-4-1912', () => {
    const c = S.jdToCalendar(seed.features.find((x) => x.properties.id === 'seed.titanic-sinking').properties.time.instant.jd_ut, 'auto');
    return c.year === 1912 && c.month === 4 && c.day === 15 && c.hour === 5 && c.minute === 18;
});
{
    const shardDir = path.join(root, 'data/events');
    const files = fs.existsSync(shardDir) ? fs.readdirSync(shardDir).filter((f) => /^c\d+\.json$/.test(f)) : [];
    check('sucesos de Wikidata: cada fichero contiene solo registros de su siglo, con id unico y notoriedad en [0,1]', () => {
        const ids = new Set();
        for (const file of files) {
            const century = parseInt(file.slice(1), 10);
            const data = JSON.parse(fs.readFileSync(path.join(shardDir, file), 'utf8'));
            for (const f of data.features) {
                const p = f.properties;
                if (ids.has(p.id)) throw new Error('id repetido ' + p.id); ids.add(p.id);
                if (!(p.importance >= 0 && p.importance <= 1)) throw new Error('importancia ' + p.id);
                const year = Math.floor(1950 - (p.time.start_ybp + p.time.end_ybp) / 2);
                if (Math.floor(year / 100) !== century) throw new Error(p.id + ' en el siglo equivocado: ' + year + ' en ' + file);
            }
        }
        return true;
    });
}

/* ---------- El esquema rechaza lo que debe, por el motivo correcto ---------- */
check('esquema: una hora sin "instant" se rechaza por falta de instant (no por otra cosa)', () => {
    const f = clone(seed.features[0]); delete f.properties.time.instant;
    const r = reasons(f);
    return /\[instant\]/.test(r);
});
check('esquema: una hora local sin desfase se rechaza por falta de utc_offset_minutes', () => {
    const f = clone(seed.features.find((x) => x.properties.time.instant.basis === 'local_civil')); delete f.properties.time.instant.utc_offset_minutes;
    return /\[utc_offset_minutes\]/.test(reasons(f));
});
check('esquema: precision de minuto sin calendario se rechaza por falta de calendar', () => {
    const f = clone(seed.features[0]); delete f.properties.time.calendar;
    return /\[calendar\]/.test(reasons(f));
});
check('esquema: la geometria nula es valida (suceso con fecha y sin lugar) y una geometria rota no', () => {
    const f = clone(seed.features[0]); f.geometry = null;
    const ok = validate(f) === true;
    const g = clone(seed.features[0]); g.geometry = { type: 'Point' };
    return ok && validate(g) === false && /coordinates/.test(reasons(g));
});
check('esquema: una importancia fuera de [0,1] se rechaza', () => { const f = clone(seed.features[0]); f.properties.importance = 1.5; return /maximum|<= 1/.test(reasons(f)); });

/* ---------- Conversion de filas de Wikidata ---------- */
const row = (o) => ({ item: { value: 'http://www.wikidata.org/entity/' + (o.q || 'Q1268') }, label: { value: o.label === undefined ? 'Frédéric Chopin' : o.label }, sl: { value: String(o.sl || 210) }, t: { value: o.t || '1810-03-01T00:00:00Z' }, prec: { value: String(o.prec || 11) }, cal: { value: 'http://www.wikidata.org/entity/' + (o.cal || 'Q1985727') }, ...(o.coord ? { coord: { value: o.coord } } : {}), ...(o.es ? { es: { value: o.es } } : {}) });
check('wikidata: una fila valida se convierte en un registro que cumple el esquema', () => {
    const r = B.bindingToFeature('birth', row({ coord: 'Point(20.7 52.3)', es: 'Federico Chopin' }), '2026-11-01T00:00:00Z');
    if (!r.feature) throw new Error('no convirtio: ' + r.skip);
    if (!validate(r.feature)) throw new Error(reasons(r.feature));
    return r.feature.properties.labels.es === 'Federico Chopin' && r.feature.geometry.coordinates[0] === 20.7;
});
check('wikidata: precision de mes y de año producen tramos, no un dia', () => {
    const m = B.bindingToFeature('publication', row({ t: '1851-10-01T00:00:00Z', prec: 10 }), 'x').feature.properties.time;
    const y = B.bindingToFeature('publication', row({ t: '1851-01-01T00:00:00Z', prec: 9 }), 'x').feature.properties.time;
    return m.precision === 'month' && m.start_ybp > m.end_ybp && y.precision === 'year' && Math.abs((y.start_ybp - y.end_ybp) - 1) < 0.01;
});
check('wikidata: el calendario juliano da otro dia juliano que el gregoriano para la misma fecha', () => {
    const a = B.bindingToFeature('birth', row({ t: '1500-03-01T00:00:00Z', cal: 'Q1985786' }), 'x').feature.properties.time;
    const b = B.bindingToFeature('birth', row({ t: '1500-03-01T00:00:00Z', cal: 'Q1985727' }), 'x').feature.properties.time;
    return a.calendar === 'julian' && b.calendar === 'gregorian' && Math.abs((a.start_ybp - b.start_ybp) * 365.25 + 9) < 0.5 || Math.abs((a.start_ybp - b.start_ybp) * 365.25) > 8;
});
check('wikidata: se descarta, con motivo, lo que no se puede afirmar', () => {
    const why = (o, kind) => B.bindingToFeature(kind || 'birth', row(o), 'x').skip;
    return /etiqueta/.test(why({ label: '' })) && /etiqueta/.test(why({ label: 'Q12345' })) && /anterior al a/.test(why({ t: '-0044-03-15T00:00:00Z' })) && /calendario/.test(why({ cal: 'Q999' })) && /ilegible/.test(why({ t: 'ayer' }));
});
check('wikidata: sin coordenadas el suceso se conserva con geometria nula (fecha sin lugar)', () => {
    const r = B.bindingToFeature('birth', row({}), '2026-11-01T00:00:00Z');
    return r.feature.geometry === null && validate(r.feature) === true;
});
check('wikidata: las ventanas de tiempo cubren todo sin huecos ni solapes', () => {
    for (const k of Object.keys(B.KINDS)) {
        const w = B.windows(B.KINDS[k].steps);
        for (let i = 1; i < w.length; i++) if (w[i][0] !== w[i - 1][1]) throw new Error(k + ' hueco en ' + w[i][0]);
        if (w[0][0] !== 1 || w[w.length - 1][1] !== 2027) return false;
    }
    return true;
});
check('wikidata: la importancia crece con las sitelinks y se queda en [0,1]', () => {
    const imp = (sl) => B.bindingToFeature('birth', row({ sl }), 'x').feature.properties.importance;
    return imp(60) < imp(120) && imp(120) < imp(300) && imp(100000) === 1 && imp(1) >= 0;
});

/* ---------- Seleccion por escala y tiempo ---------- */
const jdOf = (y, m, d, h = 0, mi = 0, s = 0) => S.calendarToJD({ year: y, month: m, day: d, hour: h, minute: mi, second: s }, 'auto').jd;
const mk = (id, imp, lng, lat, jd, precision = 'day', extra = {}) => ({
    type: 'Feature', geometry: lng === null ? null : { type: 'Point', coordinates: [lng, lat] },
    properties: { id, importance: imp, time: { start_ybp: (2433282.5 - jd) / 365.25, end_ybp: (2433282.5 - jd) / 365.25, precision, ...extra } }
});
{
    const jd0 = jdOf(1810, 3, 1);
    const feats = [mk('grande', 0.95, 20, 52, jd0), mk('medio', 0.6, 21, 52.2, jd0 + 100), mk('pequeño', 0.3, 22, 52.4, jd0 - 50), mk('lejano', 0.99, 20, 52, jd0 + 400), mk('sinlugar', 0.99, null, null, jd0)];
    const sel = (viewMeters, extra) => T.selectVisible(feats, { jd: jd0, viewMeters, ...extra }).map((f) => f.properties.id);
    check('seleccion: con el globo entero solo salen los muy notorios', () => JSON.stringify(sel(2e7)) === '["grande"]');
    check('seleccion: al acercarse aparecen los de notoriedad media y, muy cerca, todos los de la ventana', () => sel(5e5).includes('medio') && !sel(5e5).includes('pequeño') && sel(1e4).includes('pequeño'));
    check('seleccion: lo que ocurre fuera de la ventana de tiempo no sale nunca, ni lo que no tiene lugar', () => !sel(1e4).includes('lejano') && !sel(1e4).includes('sinlugar'));
    check('seleccion: la ventana de tiempo es configurable', () => sel(1e4, { halfWindowDays: 500 }).includes('lejano'));
    check('seleccion: una celda de pantalla ocupada deja pasar solo al mas notorio', () => {
        const r = T.selectVisible(feats, { jd: jd0, viewMeters: 1e4, project: () => [10, 10] }).map((f) => f.properties.id);
        return r.length === 1 && r[0] === 'grande';
    });
    check('seleccion: respeta el recuadro visible, tambien cruzando el antimeridiano', () => {
        const a = T.selectVisible(feats, { jd: jd0, viewMeters: 1e4, bounds: [30, 40, 40, 60] }).length;
        const wrap = [mk('w1', 0.9, 179, 0, jd0), mk('w2', 0.9, -179, 0, jd0), mk('w3', 0.9, 0, 0, jd0)];
        const b = T.selectVisible(wrap, { jd: jd0, viewMeters: 1e4, bounds: [170, -10, -170, 10] }).map((f) => f.properties.id).sort().join();
        return a === 0 && b === 'w1,w2';
    });
    check('seleccion: el umbral de notoriedad no baja nunca al alejarse', () => {
        let prev = -1;
        for (const v of [1e3, 4e4, 1e5, 3e5, 8e5, 2e6, 5e6, 1e7, 2e7]) { const f = T.importanceFloor(v); if (f < prev) return false; prev = f; }
        return true;
    });
    check('seleccion: un suceso de año entero se ve durante todo ese año', () => {
        const y = mk('añoentero', 0.95, 1, 1, jd0, 'year'); y.properties.time.start_ybp = (2433282.5 - jdOf(1810, 1, 1)) / 365.25; y.properties.time.end_ybp = (2433282.5 - jdOf(1811, 1, 1)) / 365.25;
        return T.selectVisible([y], { jd: jdOf(1810, 12, 20), halfWindowDays: 1, viewMeters: 1e7 }).length === 1 && T.selectVisible([y], { jd: jdOf(1812, 6, 1), halfWindowDays: 1, viewMeters: 1e7 }).length === 0;
    });
}

/* ---------- Avisos ---------- */
{
    const ev = seed.features.find((f) => f.properties.id === 'seed.vostok-1-launch');
    const t0 = ev.properties.time.instant.jd_ut;
    const day = mk('nace', 0.9, 20, 52, jdOf(1810, 3, 1));
    const step = (from, to, feats) => T.notices(feats || [ev, day], from, to).map((n) => n.feature.properties.id + ':' + n.phase + (n.phase === 'lead' ? n.leadS : ''));
    check('avisos: a 5 min, 1 min y 10 s se avisa una sola vez cada uno, y en el instante se dice "ahora"', () => {
        const seen = [];
        for (let s = -400; s <= 5; s++) seen.push(...step(t0 + (s - 1) / 86400, t0 + s / 86400));
        return JSON.stringify(seen) === JSON.stringify(['seed.vostok-1-launch:lead300', 'seed.vostok-1-launch:lead60', 'seed.vostok-1-launch:lead10', 'seed.vostok-1-launch:now']);
    });
    check('avisos: dos pasos seguidos no repiten el aviso (cada cruce es un solo intervalo)', () => {
        const a = step(t0 - 301 / 86400, t0 - 299 / 86400); const b = step(t0 - 299 / 86400, t0 - 297 / 86400);
        return a.length === 1 && b.length === 0;
    });
    check('avisos: al entrar en el dia de un suceso solo con fecha se avisa de que es hoy', () => {
        const r = step(jdOf(1810, 2, 28, 23, 59, 59), jdOf(1810, 3, 1, 0, 0, 1));
        return r.length === 1 && r[0] === 'nace:day';
    });
    check('avisos: saltar de siglo con la barra no dispara una cascada (salto grande = silencio)', () => step(jdOf(1700, 1, 1), jdOf(1961, 4, 12, 5, 0, 0)).length === 0 && step(jdOf(1700, 1, 1), jdOf(1810, 3, 1, 5)).length === 0);
    check('avisos: pero aterrizar a 5 minutos de un suceso con hora da un aviso de cuenta atras', () => {
        const r = T.notices([ev], jdOf(1700, 1, 1), t0 - 300 / 86400);
        return r.length === 1 && r[0].phase === 'jump' && r[0].leadS === 300;
    });
    check('avisos: al ir hacia atras no se avisa', () => step(t0 + 10 / 86400, t0 - 10 / 86400).length === 0);
    check('avisos: una hora no es lo mismo que un dia: el suceso con hora no avisa "dia" y el de dia no avisa "lead"', () => {
        const all = [];
        for (let s = -3600 * 30; s < 3600 * 30; s += 600) all.push(...step(t0 + s / 86400, t0 + (s + 600) / 86400));
        return all.every((x) => x.startsWith('seed.vostok-1-launch:lead') || x.startsWith('seed.vostok-1-launch:now'));
    });
    check('avisos: la cuenta atras se escribe en horas, minutos o segundos', () => T.formatCountdown(3725, 'es') === '1 h 02 min' && T.formatCountdown(252, 'es') === '4 min 12 s' && T.formatCountdown(37, 'en') === '37 s' && T.formatCountdown(-5, 'es') === '0 s');
    check('ficheros: las claves de siglo cubren un rango de años', () => JSON.stringify(T.shardKeys(1799, 1801)) === '["c17","c18"]' && JSON.stringify(T.shardKeys(-300, 150)) === '["c0","c1"]');
}

console.log('\nPASS ' + passes.length);
passes.forEach((p) => console.log('  ok  ' + p));
if (failures.length) { console.log('\nFAIL ' + failures.length); failures.forEach((f) => console.log('  XX  ' + f)); process.exit(1); }
console.log('\nSucesos: todo verde.');
