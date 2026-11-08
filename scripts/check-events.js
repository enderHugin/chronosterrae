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
const check = (name, fn) => { try { const r = fn(); if (r === true) passes.push(name); else failures.push(name + (r === false ? '' : ' -> ' + String(r).slice(0, 300))); } catch (e) { failures.push(name + ' -> ' + e.message); } };

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
const D = require('./check-data.js');
const mkf = (id, kind, iso, cal = 'gregorian') => {
    const span = D.isoToSpan(iso, cal); const ybp = (jd) => (2433282.5 - jd) / 365.25;
    return { feature: { properties: { id, name: id, kind, time: { iso, calendar: cal, start_ybp: ybp(span[0]), end_ybp: ybp(span[1]) } } }, file: null };
};
check('coherencia: muerte antes de nacer y edades imposibles se apartan; lo coherente pasa', () => {
    const r = D.analyze([
        mkf('wd.q1.birth', 'birth', '1900-05-01'), mkf('wd.q1.death', 'death', '1980-02-03'),        // normal
        mkf('wd.q2.birth', 'birth', '1900-05-01'), mkf('wd.q2.death', 'death', '1899-01-01'),        // murio antes de nacer
        mkf('wd.q3.birth', 'birth', '1681-08-05'), mkf('wd.q3.death', 'death', '1741-12-19'), mkf('wd.q3.death.2', 'death', '1909-12-05'),   // una muerte buena y otra erronea
        mkf('wd.q4.birth', 'birth', '1700'), mkf('wd.q4.death', 'death', '1800')                      // 100 años con precision de año: dentro de lo posible
    ], 2026);
    const dropped = [...r.drop].sort().join(',');
    return r.hard.length === 0 && dropped === 'wd.q2.birth,wd.q2.death,wd.q3.death.2';
});
check('coherencia: un iso que no cuadra con los años-antes-del-presente es un error nuestro', () => {
    const f = mkf('wd.q9.birth', 'birth', '1900-05-01'); f.feature.properties.time.start_ybp += 5; f.feature.properties.time.end_ybp += 5;
    return D.analyze([f], 2026).hard.length === 1;
});
check('coherencia: una fecha futura en un nacimiento es una anomalia', () => D.analyze([mkf('wd.q8.birth', 'birth', '2300-01-01')], 2026).anomalies.length === 1);
check('semilla: el suceso con hora sustituye a su gemelo masivo de solo fecha, y nada mas', () => {
    const seed = [{ properties: { name: 'Space Shuttle Challenger disaster', time: { iso: '1986-01-28T16:39:13Z' } } }];
    const bulk = [
        { properties: { name: 'Space Shuttle Challenger disaster', time: { iso: '1986-01-28' } } },   // mismo
        { properties: { name: 'Challenger Deep expedition', time: { iso: '1986' } } },                 // palabra comun, año que contiene la fecha: gemelo dudoso
        { properties: { name: 'Challenger disaster inquiry', time: { iso: '1986-06-09' } } },          // otra fecha: se conserva
        { properties: { name: 'Apollo launch', time: { iso: '1986-01-28' } } }                         // misma fecha, otro asunto: se conserva
    ];
    const kept = T.dedupeAgainst(seed, bulk).map((f) => f.properties.name);
    return !kept.includes('Space Shuttle Challenger disaster') && kept.includes('Challenger disaster inquiry') && kept.includes('Apollo launch');
});
check('wikidata: no entran años sueltos ni asteroides numerados, pero si sucesos con cifras en el nombre', () => {
    const sk = (label, kind) => B.bindingToFeature(kind, row({ label }), 'x').skip;
    return /a.o/.test(sk('1999', 'event')) && /asteroide/.test(sk('3537 Jürgen', 'discovery')) && /asteroide/.test(sk('(5131) 1990 BG', 'discovery')) && /asteroide/.test(sk('2000 AB1', 'discovery'))
        && sk('1968 Winter Olympics', 'event') === undefined && sk('2001 Mars Odyssey', 'discovery') === undefined && sk('Pluto', 'discovery') === undefined;
});
check('wikidata: las coordenadas llegan como QLever las da de verdad, «POINT(lng lat)» en mayusculas con seis decimales (forma medida con la sonda, 2026-11-06)', () => {
    const r = B.bindingToFeature('event', row({ coord: 'POINT(-75.150000 39.948900)' }), '2026-11-01T00:00:00Z');
    return r.feature && r.feature.geometry && r.feature.geometry.coordinates[0] === -75.15 && r.feature.geometry.coordinates[1] === 39.9489;
});
check('wikidata: una coordenada ilegible o fuera de rango NO se convierte en lugar (se conserva el suceso sin geometria)', () =>
    ['POINT(abc def)', 'POINT(200 10)', 'POINT(10 95)', 'LINESTRING(1 2, 3 4)', 'POINT(1)'].every((c) => { const r = B.bindingToFeature('event', row({ coord: c }), '2026-11-01T00:00:00Z'); return r.feature && r.feature.geometry === null; }));
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
check('wikidata: la consulta masiva no filtra por fecha en el servidor y empieza por la notoriedad', () => {
    for (const k of Object.keys(B.KINDS)) {
        const q = B.queryAll(k);
        if (/xsd:dateTime|FILTER\(\?t /.test(q)) throw new Error(k + ': filtra por fecha en el servidor');
        if (q.indexOf('wikibase:sitelinks') > q.indexOf('p:' + B.KINDS[k].prop)) throw new Error(k + ': la notoriedad no va primero');
        if (!/PREFIX wikibase:/.test(q) || !/SELECT DISTINCT/.test(q)) throw new Error(k + ': faltan prefijos o DISTINCT');
    }
    return !/DeprecatedRank/.test(B.queryAll('birth', false)) && /DeprecatedRank/.test(B.queryAll('birth', true));
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

/* ---------- Ventana segun la velocidad del tiempo y desvanecido ---------- */
{
    const YEAR_S = 31557600;
    check('ventana: con tiempo parado o lento (hasta 1 mes/s) vale el minimo de siempre, simetrico y sin «flowing»', () => [0, 1, 3600, 86400, 2629800].every((r) => { const w = T.windowFor(r); return w.pastDays === 183 && w.futureDays === 183 && w.flowing === false; }));
    check('ventana: a 1 año/s el pasado es proporcional a la velocidad (6 s reales) y por delante queda un margen corto', () => {
        const w = T.windowFor(YEAR_S); return Math.abs(w.pastDays - YEAR_S * 6 / 86400) < 1e-6 && w.flowing && w.futureDays >= 30 && w.futureDays < w.pastDays / 4;
    });
    check('ventana: doblar la velocidad dobla la ventana (mientras no llegue al tope)', () => Math.abs(T.windowFor(2 * YEAR_S).pastDays / T.windowFor(YEAR_S).pastDays - 2) < 1e-9);
    check('ventana: hacia atras es el espejo (la ventana larga queda del lado de donde viene el tiempo)', () => { const a = T.windowFor(YEAR_S); const b = T.windowFor(-YEAR_S); return a.pastDays === b.futureDays && a.futureDays === b.pastDays; });
    check('ventana: tiene tope (100 años) aunque la velocidad sea enorme', () => T.windowFor(1e12).pastDays === T.MAX_PAST_DAYS && T.windowFor(-1e12).futureDays === T.MAX_PAST_DAYS);
    check('ventana: velocidades absurdas (NaN, Infinity, undefined) no rompen: caen en el minimo o en el tope', () => T.windowFor(NaN).flowing === false && T.windowFor(undefined).flowing === false && Number.isFinite(T.windowFor(Infinity).pastDays));
    check('umbral por ventana: no baja nunca al alargarla y sube de 0 a 0.78', () => {
        let prev = -1; for (const d of [1, 183, 400, 1000, 3700, 5000, 11000, 36525]) { const f = T.windowImportance(d); if (f < prev) return false; prev = f; }
        return T.windowImportance(183) === 0 && T.windowImportance(36525) === 0.78;
    });
    check('desvanecido: 4 niveles, nunca sube con la antiguedad, 1 en el presente y >0 en el borde', () => {
        const xs = [0, 0.1, 0.15, 0.2, 0.4, 0.5, 0.7, 0.9, 1, 5]; const as = xs.map(T.fadeAlpha);
        return as.every((a, i) => i === 0 || a <= as[i - 1]) && as[0] === 1 && new Set(as).size === 4 && as[as.length - 1] > 0 ? true : as.join();
    });
    check('desvanecido: valores invalidos (NaN, negativo, undefined) no dan NaN', () => [NaN, undefined, -3, Infinity].every((x) => { const a = T.fadeAlpha(x); return Number.isFinite(a) && a > 0 && a <= 1; }));
    const jdw = jdOf(1900, 1, 1);
    const ev = (id, imp, daysAgo, lng = 10) => mk(id, imp, lng, 40, jdw - daysAgo, 'year', { end_ybp: (2433282.5 - (jdw - daysAgo)) / 365.25 });
    check('antiguedad: dentro del tramo del suceso es 0; fuera crece hasta 1 en el borde de la ventana y se queda en 1', () => {
        const f = ev('a', 0.9, 100); f.properties.time.start_ybp = (2433282.5 - (jdw - 150)) / 365.25; f.properties.time.end_ybp = (2433282.5 - (jdw - 50)) / 365.25; f.properties.time.precision = 'range';
        return T.ageFraction(f, jdw - 100, 1000, 1000) === 0 && Math.abs(T.ageFraction(f, jdw + 450, 1000, 1000) - 0.5) < 1e-9 && T.ageFraction(f, jdw + 5000, 1000, 1000) === 1;
    });
    check('antiguedad: un suceso aun por llegar se mide contra la ventana de futuro', () => { const f = ev('fut', 0.9, -50); return Math.abs(T.ageFraction(f, jdw, 1000, 100) - 0.5) < 1e-6; });
    const evs = [ev('hace1a', 0.9, 365), ev('hace5a', 0.9, 5 * 365, 11), ev('hace20a', 0.9, 20 * 365, 12), ev('menor', 0.3, 100, 13), ev('manana', 0.9, -10, 14)];
    const pick = (o) => T.selectVisible(evs, { jd: jdw, viewMeters: 1e4, ...o }).map((f) => f.properties.id).sort().join();
    check('ventana por velocidad: con tiempo parado solo se ve lo de ±6 meses; a 1 año/s entra lo de hace 5 años y sigue fuera lo de hace 20', () => {
        const still = pick({ ...T.windowFor(0) }); const fast = pick({ ...T.windowFor(YEAR_S) });
        return still === 'manana,menor' && fast === 'hace1a,hace5a,manana' ? true : still + ' | ' + fast;
    });
    check('ventana por velocidad: a mas velocidad solo los significativos (el de importancia 0.3 deja de verse)', () => !pick({ ...T.windowFor(YEAR_S) }).includes('menor') && pick({ ...T.windowFor(0) }).includes('menor'));
    check('ventana por velocidad: a 10 años/s (ventana de 60 años) solo salen los muy notorios', () => {
        const w = T.windowFor(10 * YEAR_S); const sel = T.selectVisible([ev('muy', 0.9, 20 * 365), ev('medio', 0.7, 20 * 365, 20)], { jd: jdw, viewMeters: 1e4, ...w }).map((f) => f.properties.id);
        return sel.join() === 'muy' ? true : sel.join();
    });
    check('ventana por velocidad: hacia atras, lo reciente por venir queda detras y entra lo futuro', () => {
        const back = pick({ ...T.windowFor(-YEAR_S) });
        return back.includes('manana') && !back.includes('hace5a') ? true : back;
    });
    check('meta: cada suceso dibujado recibe su nivel de desvanecido y los mas antiguos son mas tenues', () => {
        const meta = new Map(); const sel = T.selectVisible(evs, { jd: jdw, viewMeters: 1e4, ...T.windowFor(YEAR_S), meta });
        const al = (id) => meta.get(sel.find((f) => f.properties.id === id)).alpha;
        return meta.size === sel.length && al('manana') >= al('hace1a') && al('hace1a') > al('hace5a') && al('hace5a') > 0 ? true : [...meta.values()].map((m) => m.alpha).join();
    });
    check('ventana: sin pastDays/futureDays todo sigue como antes (halfWindowDays y sin umbral por ventana)', () => T.selectVisible([ev('lejos', 0.5, 600)], { jd: jdw, viewMeters: 1e4 }).length === 0 && T.selectVisible([ev('lejos', 0.5, 600)], { jd: jdw, viewMeters: 1e4, halfWindowDays: 700 }).length === 1);

    // ---- Medidor de velocidad
    const feed = (m, jdPerS, fromMs, toMs, stepMs, jd0) => { let jd = jd0; for (let t = fromMs; t <= toMs; t += stepMs) { m.note(jd, t); jd += jdPerS * stepMs / 1000; } return jd; };
    check('medidor: reloj a 1 año/s a 16 ms por nota mide ~1 año/s en 2 s', () => {
        const m = T.createMotion(); feed(m, 365.25, 0, 2000, 16, jdw); const r = m.rate(2000); return Math.abs(r / YEAR_S - 1) < 0.05 ? true : r / YEAR_S;
    });
    check('medidor: hacia atras da velocidad negativa', () => { const m = T.createMotion(); feed(m, -365.25, 0, 2000, 16, jdw); return m.rate(2000) < -0.9 * YEAR_S; });
    check('medidor: un salto aislado (un boton de epoca) NO cuenta como tiempo que fluye', () => {
        const m = T.createMotion(); m.note(jdw, 0); m.note(jdw + 36525, 5000); m.note(jdw + 73050, 10000); return m.rate(10000) === 0;
    });
    check('medidor: al parar baja despacio (a los ~3 s queda ~la mitad) y a los 20 s es casi nada', () => {
        const m = T.createMotion(); feed(m, 365.25, 0, 2000, 16, jdw); const v0 = m.rate(2000); const r1 = m.rate(2000 + 400 + 2500) / v0; const r2 = m.rate(22000) / v0;
        return r1 > 0.4 && r1 < 0.6 && r2 < 0.01 ? true : [r1, r2].join();
    });
    check('medidor: tiempo real (1 s/s) queda dentro del minimo de ventana', () => { const m = T.createMotion(); feed(m, 1 / 86400, 0, 3000, 50, jdw); return T.windowFor(m.rate(3000)).flowing === false; });
    check('medidor: entradas invalidas se ignoran sin romper; reset lo deja a cero', () => {
        const m = T.createMotion(); m.note(NaN, 0); m.note(jdw, NaN); feed(m, 365.25, 0, 1000, 16, jdw); const ok = m.rate(1000) > 0; m.reset(); return ok && m.rate(1000) === 0;
    });
    check('medidor: velocidad acotada al tope aunque las notas sean disparatadas', () => { const m = T.createMotion(); for (let i = 0; i < 50; i++) m.note(jdw + i * 1e6, i * 10); return Math.abs(m.rate(500)) <= T.MAX_RATE; });
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

/* ---------- Intervalos (guerras) y relaciones: filas con la forma medida por la sonda links-probe (2026-11-06) ---------- */
{
    const GREG = 'http://www.wikidata.org/entity/Q1985727'; const JUL = 'http://www.wikidata.org/entity/Q1985786';
    const E = 'http://www.wikidata.org/entity/';
    const srow = (o) => ({ item: { value: E + (o.q || 'Q1018969') }, label: { value: o.label === undefined ? 'Siege of Van' : o.label }, sl: { value: '28' },
        a: { value: o.a || '1915-04-19T00:00:00Z' }, pa: { value: String(o.pa || 11) }, ca: { value: o.ca || GREG },
        ...(o.b === null ? {} : { b: { value: o.b || '1915-05-17T00:00:00Z' }, pb: { value: String(o.pb || 11) }, cb: { value: o.cb || GREG } }), ...(o.coord ? { coord: { value: o.coord } } : {}) });
    const conv = (rows) => B.spanRowsToFeatures(rows, '2026-11-06T00:00:00Z');
    check('intervalo: un asedio con inicio y fin al dia es UN registro que cumple el esquema, con iso «inicio/fin» y tramo que va del primer al ultimo dia', () => {
        const r = conv([srow({})]); const f = r.features[0];
        if (!f) throw new Error('no convirtio ' + JSON.stringify(r.skipped));
        if (!validate(f)) throw new Error(reasons(f));
        const tm = f.properties.time;
        return tm.iso === '1915-04-19/1915-05-17' && tm.precision === 'day' && Math.abs((tm.start_ybp - tm.end_ybp) * 365.25 - 28) < 0.01 && f.properties.id === 'wd.q1018969.event';
    });
    check('intervalo: el iso «inicio/fin» pasa la comprobacion de coherencia de check-data (iso y años-antes-del-presente coinciden)', () => {
        const f = conv([srow({})]).features[0]; const g = conv([srow({ q: 'Q2', a: '1609-01-01T00:00:00Z', pa: 9, b: '1618-01-01T00:00:00Z', pb: 9 })]).features[0];
        return D.analyze([{ feature: f, file: null }, { feature: g, file: null }], 2026).hard.length === 0 ? true : JSON.stringify(D.analyze([{ feature: f, file: null }, { feature: g, file: null }], 2026).hard);
    });
    check('intervalo: un elemento con dos fechas de inicio (1605 y 1609) da UN registro que abarca 1605-1618 y lo declara; no elige una al azar', () => {
        const r = conv([srow({ q: 'Q1044829', label: 'Polish–Muscovite War', a: '1609-01-01T00:00:00Z', pa: 9, b: '1618-01-01T00:00:00Z', pb: 9 }), srow({ q: 'Q1044829', label: 'Polish–Muscovite War', a: '1605-01-01T00:00:00Z', pa: 9, b: '1618-01-01T00:00:00Z', pb: 9 })]);
        const f = r.features[0]; const tm = f.properties.time;
        return r.features.length === 1 && validate(f) && tm.iso === '1605/1618' && tm.precision === 'year' && /varias fechas/.test(f.properties.sources[0].citation) ? true : JSON.stringify(f);
    });
    check('intervalo: el fin es anterior al inicio -> descartado con ese motivo (no roto)', () => { const r = conv([srow({ a: '1915-05-17T00:00:00Z', b: '1915-04-19T00:00:00Z' })]); return r.features.length === 0 && r.skipped['el fin es anterior al inicio'] === 1 ? true : JSON.stringify(r); });
    check('intervalo: sin fin en la fila -> descartado (por «fecha ilegible» o «calendario desconocido», lo que se compruebe antes), no se inventa un fin', () => { const r = conv([srow({ b: null })]); const k = Object.keys(r.skipped); return r.features.length === 0 && k.length === 1 && ['fecha ilegible', 'calendario desconocido'].includes(k[0]) && r.skipped[k[0]] === 1 ? true : JSON.stringify(r); });
    check('intervalo: calendarios distintos en inicio y fin -> descartado con ese motivo', () => { const r = conv([srow({ cb: JUL })]); return r.features.length === 0 && r.skipped['calendarios distintos en inicio y fin'] === 1 ? true : JSON.stringify(r); });
    check('intervalo: calendario desconocido, etiqueta ausente o que es un QID, id que no es Q<n>, anterior al año 1 -> descartados cada uno por su motivo', () => {
        const r = conv([srow({ ca: E + 'Q9', cb: E + 'Q9' }), srow({ q: 'Q3', label: 'Q123' }), { ...srow({ q: 'Q4' }), item: { value: E + 'xyz' } }, srow({ q: 'Q5', a: '-0100-01-01T00:00:00Z', b: '-0050-01-01T00:00:00Z' })]);
        return r.features.length === 0 && r.skipped['calendario desconocido'] === 1 && r.skipped['sin etiqueta'] === 1 && r.skipped['sin identificador de Wikidata'] === 1 && r.skipped['anterior al año 1 (numeracion sin calibrar)'] === 1 ? true : JSON.stringify(r.skipped);
    });
    check('intervalo: las coordenadas POINT(...) de la fila pasan a geometria', () => { const f = conv([srow({ coord: 'POINT(43.38 38.5)' })]).features[0]; return f.geometry && f.geometry.coordinates[0] === 43.38 && validate(f); });
    check('consulta de intervalos: solo clases de la lista medida, fin obligatorio (P582 no es OPTIONAL) y se excluyen los que ya tienen momento (P585)', () => {
        const q = B.spanQuery(); const vals = (/VALUES \?cls \{([^}]*)\}/.exec(q) || [])[1] || '';
        const ids = vals.match(/Q\d+/g) || [];
        return ids.length === Object.keys(B.SPAN_CLASSES).length && ids.every((x) => x in B.SPAN_CLASSES) && !/OPTIONAL \{ \?item p:P582/.test(q) && /FILTER NOT EXISTS \{ \?item wdt:P585/.test(q) && /P582/.test(q);
    });
    check('las clases de intervalo son las verificadas en la sonda (guerra, batalla, guerra civil, asedio, operacion, rebelion, campaña, serie de guerras, brote)', () => ['Q198', 'Q178561', 'Q8465', 'Q188055', 'Q645883', 'Q124734', 'Q831663', 'Q104212151', 'Q3241045'].every((q) => q in B.SPAN_CLASSES) && Object.keys(B.SPAN_CLASSES).length === 9);

    // relaciones
    const rrow = (q, o, label, coord) => ({ item: { value: E + q }, o: { value: E + o }, ...(label ? { oLabel: { value: label } } : {}), ...(coord ? { coord: { value: coord } } : {}) });
    const base = (id, geometry) => ({ type: 'Feature', geometry: geometry || null, properties: { id, name: 'Evento', layer: 'event', kind: 'event', importance: 0.7, evidence: 'documentary', time: { start_ybp: 100, end_ybp: 100, uncertainty_yr: 0.5, precision: 'year', iso: '1850', calendar: 'gregorian' }, scale: { min_m: 100, max_m: 2e7 }, sources: [{ kind: 'wikidata', id: id.split('.')[1].toUpperCase(), citation: 'Wikidata' }], status: 'raw' } });
    check('relaciones: se agrupan por elemento, sin repetidos, con tope, y se ignora lo que no es Q<n>', () => {
        const m = B.relationRows([rrow('Q1', 'Q2', 'a'), rrow('Q1', 'Q2', 'a'), rrow('Q1', 'Q3'), rrow('Q1', 'Q4', 'd'), rrow('Q1', 'xyz', 'x'), rrow('bad', 'Q9')], 3);
        return m.get('Q1').length === 3 && m.get('Q1')[0].id === 'Q2' && m.get('Q1')[1].label === undefined && !m.has('bad');
    });
    check('enriquecer: clase, causa, efecto y «parte de» se añaden con su fuente y el registro sigue cumpliendo el esquema', () => {
        const f = base('wd.q10.event');
        const rel = { classes: B.relationRows([rrow('Q10', 'Q178561', 'battle')], 6), cause: B.relationRows([rrow('Q10', 'Q77', 'a dam failure')], 6), effect: B.relationRows([rrow('Q10', 'Q78', 'a ceasefire')], 8), part_of: B.relationRows([rrow('Q10', 'Q79')], 4) };
        const out = B.enrichEvents([f], rel); const p = f.properties;
        if (!validate(f)) throw new Error(reasons(f));
        return out.classes === 1 && p.classes[0].id === 'Q178561' && p.links.length === 3 && p.links.map((l) => l.rel).join() === 'cause,effect,part_of' && p.links.every((l) => l.source.kind === 'wikidata' && /P828|P1542|P361/.test(l.source.citation)) && p.links[2].target.label === undefined ? true : JSON.stringify(p);
    });
    check('enriquecer: lo que Wikidata no tiene NO aparece (sin relaciones no hay `links` ni `classes`)', () => { const f = base('wd.q11.event'); const out = B.enrichEvents([f], { classes: new Map(), cause: new Map() }); return !('links' in f.properties) && !('classes' in f.properties) && out.links === 0; });
    check('enriquecer: un lugar con UNA coordenada pone geometria y lo declara en la cita; con DOS lugares distintos NO elige uno y se cuenta', () => {
        const a = base('wd.q12.event'); const b = base('wd.q13.event');
        const rel = { place: B.relationRows([rrow('Q12', 'Q100', null, 'POINT(-71.057778 42.360278)'), rrow('Q13', 'Q100', null, 'POINT(-71.057778 42.360278)'), rrow('Q13', 'Q101', null, 'POINT(2.35 48.85)')], 50) };
        const out = B.enrichEvents([a, b], rel);
        return a.geometry && a.geometry.coordinates[0] === -71.05778 && /P276\/P625/.test(a.properties.sources[0].citation) && b.geometry === null && out.placed === 1 && out.ambiguousPlace === 1 && validate(a) ? true : JSON.stringify({ a: a.geometry, b: b.geometry, out });
    });
    check('enriquecer: las coordenadas propias del suceso NO se pisan con las de su lugar', () => {
        const f = base('wd.q14.event', { type: 'Point', coordinates: [1, 2] });
        B.enrichEvents([f], { place: B.relationRows([rrow('Q14', 'Q100', null, 'POINT(30 40)')], 50) }); return f.geometry.coordinates[0] === 1;
    });
    check('enriquecer: solo los sucesos (kind event); un nacimiento no recibe relaciones de otro elemento', () => {
        const f = base('wd.q15.birth'); f.properties.kind = 'birth'; B.enrichEvents([f], { cause: B.relationRows([rrow('Q15', 'Q9', 'x')], 6) }); return !('links' in f.properties);
    });
    check('DISEÑO: cada consulta de relacion pide UNA propiedad (nunca varias con OPTIONAL: la sonda midio 86 344 filas y 20 s para 300 elementos)', () =>
        Object.entries(B.RELATIONS).every(([k, def]) => { const q = def.query(); const props = new Set(q.match(/wdt:P(?:31|828|1542|361|276)\b/g) || []); return props.size === 1 && !/OPTIONAL \{ \?item wdt:/.test(q); }));
}

console.log('\nPASS ' + passes.length);
passes.forEach((p) => console.log('  ok  ' + p));
if (failures.length) { console.log('\nFAIL ' + failures.length); failures.forEach((f) => console.log('  XX  ' + f)); process.exit(1); }
console.log('\nSucesos: todo verde.');
