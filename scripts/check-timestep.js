#!/usr/bin/env node
// Pruebas de sky/timestep.js (paso de las flechas con el deslizador en foco). Sin red.
'use strict';
const Sky = require('../sky/sky.js'); const T = require('../sky/timestep.js');
let fails = 0;
const check = (name, fn) => { let ok = false; let extra = ''; try { const r = fn(); ok = r === true; if (r !== true && r !== false) extra = String(r); } catch (e) { extra = e.message; } if (!ok) fails++; console.log((ok ? '  ok  ' : ' FALLO ') + name + (extra ? '  -> ' + extra : '')); };
const jd = (y, m, d, h = 0, mi = 0) => Sky.calendarToJD({ year: y, month: m, day: d, hour: h, minute: mi }, 'auto').jd;
const NOW = jd(2026, 11, 2, 22, 0);
const ctx = (over) => Object.assign({ jd: jd(2000, 6, 15, 12, 0), ybp: -50, minYear: -100000, nowYear: 2026, present: 1950, minJD: jd(-100000, 1, 1), maxJD: NOW, minYbp: -75, maxYbp: 1e9 }, over);
const cal = (j) => Sky.jdToCalendar(j, 'auto');
const ymd = (j) => { const c = cal(j); return c.year + '-' + c.month + '-' + c.day + ' ' + c.hour + ':' + String(c.minute).padStart(2, '0'); };

check('hay 16 pasos con id unico, de 1 minuto a 100 millones de anos, en orden creciente', () => {
    const ids = T.STEPS.map((s) => s.id); const yrs = T.STEPS.map(T.stepYears);
    return new Set(ids).size === 16 && T.STEPS[0].n === 60 && T.STEPS[15].n === 1e8 && yrs.every((v, i) => i === 0 || v > yrs[i - 1]) && T.byId(T.DEFAULT_ID) ? true : ids.join();
});
check('todos los pasos tienen nombre en espanol e ingles', () => T.STEPS.every((s) => s.es && s.en));
// ---- Con reloj: segundos exactos
for (const [id, secs] of [['1m', 60], ['10m', 600], ['1h', 3600], ['6h', 21600], ['1d', 86400], ['1w', 604800]]) {
    check('paso ' + id + ': +1 suma exactamente ' + secs + ' s y -1 los resta', () => {
        const c = ctx(); const a = T.move(Sky, c, id, 1).jd; const b = T.move(Sky, c, id, -1).jd;
        return Math.abs((a - c.jd) * 86400 - secs) < 1e-4 && Math.abs((c.jd - b) * 86400 - secs) < 1e-4 ? true : [(a - c.jd) * 86400, (c.jd - b) * 86400].join();
    });
}
check('x10 (Mayus) son 10 pasos', () => { const c = ctx(); return Math.abs((T.move(Sky, c, '1h', 10).jd - c.jd) * 24 - 10) < 1e-6; });
// ---- Con reloj: calendario
check('1 mes desde el 31-ene-2023: 28-feb-2023 (recorta el dia) y desde 2024: 29-feb', () => ymd(T.move(Sky, ctx({ jd: jd(2023, 1, 31, 8, 30) }), '1mo', 1).jd) === '2023-2-28 8:30' && ymd(T.move(Sky, ctx({ jd: jd(2024, 1, 31, 8, 30) }), '1mo', 1).jd) === '2024-2-29 8:30' ? true : ymd(T.move(Sky, ctx({ jd: jd(2023, 1, 31, 8, 30) }), '1mo', 1).jd));
check('calendario juliano: 31-ene-1500 +1 mes = 29-feb-1500 (1500 fue bisiesto en el juliano) y 31-ene-1900 +1 mes = 28-feb-1900', () => ymd(T.move(Sky, ctx({ jd: jd(1500, 1, 31, 0) }), '1mo', 1).jd) === '1500-2-29 0:00' && ymd(T.move(Sky, ctx({ jd: jd(1900, 1, 31, 0) }), '1mo', 1).jd) === '1900-2-28 0:00');
check('1 mes hacia atras desde el 1-ene: cruza el ano (1-dic del anterior)', () => ymd(T.move(Sky, ctx({ jd: jd(2000, 1, 1, 5, 0) }), '1mo', -1).jd) === '1999-12-1 5:00');
check('1 ano desde el 29-feb-2024: 28-feb-2025', () => ymd(T.move(Sky, ctx({ jd: jd(2024, 2, 29, 12, 0) }), '1y', 1).jd) === '2025-2-28 12:00');
check('1 siglo y 1 milenio conservan mes, dia y hora', () => ymd(T.move(Sky, ctx({ jd: jd(1492, 10, 12, 3, 20) }), '1c', -1).jd) === '1392-10-12 3:20' && ymd(T.move(Sky, ctx({ jd: jd(1492, 10, 12, 3, 20) }), '1k', -1).jd) === '492-10-12 3:20');
check('el salto de 1582: 10-oct-1581 +1 ano baja al ultimo dia valido, el 4-oct-1582 (juliano), no inventa el 10', () => ymd(T.move(Sky, ctx({ jd: jd(1581, 10, 10, 0) }), '1y', 1).jd) === '1582-10-4 0:00');
check('el ano 0 existe (astronomico): 1 ano antes del 1-ene-1 d.C. es el 1-ene del 0', () => ymd(T.move(Sky, ctx({ jd: jd(1, 1, 1, 0) }), '1y', -1).jd) === '0-1-1 0:00');
// ---- Limites
check('hacia el futuro se recorta en "ahora" (maxJD) y se avisa', () => { const r = T.move(Sky, ctx({ jd: jd(2026, 6, 1, 0) }), '10y', 1); return r.jd === NOW && r.clipped === true; });
check('un paso corto que pasa de ahora tambien se recorta', () => { const r = T.move(Sky, ctx({ jd: NOW - 0.0001 }), '1d', 1); return r.jd === NOW && r.clipped === true; });
check('desde el reloj, 1 millon de anos atras sale de la ventana: devuelve ybp exacto (1 Ma desde 1950 = 1.000.000 + 0)', () => { const r = T.move(Sky, ctx({ jd: jd(1950, 6, 1, 0) }), '1M', -1); return r.jd === undefined && r.ybp === 1000000 ? true : JSON.stringify(r); });
check('desde el reloj en el ano 2000, 100 Ma atras: ybp = 1950 - (2000 - 1e8) = 99.999.950', () => { const r = T.move(Sky, ctx(), '100M', -1); return r.ybp === 99999950 && r.jd === undefined ? true : JSON.stringify(r); });
check('limite del modelo: desde 950 Ma, 100 Ma atras se queda en 1000 Ma y avisa', () => { const r = T.move(Sky, ctx({ jd: NaN, ybp: 9.5e8 }), '100M', -1); return r.ybp === 1e9 && r.clipped === true ? true : JSON.stringify(r); });
check('limite del presente: desde 20 anos antes de hoy, +10 anos queda en el minimo (hoy)', () => { const r = T.move(Sky, ctx({ jd: NaN, ybp: 20 }), '10y', 1); return r.ybp === 10 ? true : JSON.stringify(r); });
// ---- Sin reloj (tiempo profundo)
check('sin reloj: 1 Ma hacia el presente desde 250 Ma = 249 Ma; hacia atras = 251 Ma', () => T.move(Sky, ctx({ jd: NaN, ybp: 250e6 }), '1M', 1).ybp === 249e6 && T.move(Sky, ctx({ jd: NaN, ybp: 250e6 }), '1M', -1).ybp === 251e6);
check('sin reloj: un paso menor de 1 ano (1 hora) se redondea a 1 ano y AVISA (minYear)', () => { const r = T.move(Sky, ctx({ jd: NaN, ybp: 5e6 }), '1h', -1); return r.ybp === 5e6 + 1 && r.note === 'minYear' ? true : JSON.stringify(r); });
check('sin reloj: 1 ano y mas no avisan', () => T.move(Sky, ctx({ jd: NaN, ybp: 5e6 }), '1y', -1).note === undefined && T.move(Sky, ctx({ jd: NaN, ybp: 5e6 }), '1mo', -1).note === 'minYear');
// ---- Rechazos: «rechazado» frente a «roto»
const rejects = (fn, code) => { try { fn(); return 'no rechazo'; } catch (e) { return e.code === code ? true : 'roto: ' + (e.code || e.name) + ' ' + e.message; } };
check('paso desconocido: se RECHAZA con BAD_STEP (no es un TypeError)', () => rejects(() => T.move(Sky, ctx(), '2h', 1), 'BAD_STEP'));
check('numero de pasos 0, fraccionario o no numerico: se RECHAZA con BAD_COUNT', () => rejects(() => T.move(Sky, ctx(), '1d', 0), 'BAD_COUNT') === true && rejects(() => T.move(Sky, ctx(), '1d', 1.5), 'BAD_COUNT') === true && rejects(() => T.move(Sky, ctx(), '1d', NaN), 'BAD_COUNT') === true);
check('un paso valido NO se rechaza (distingue «rechazado» de «roto»)', () => Number.isFinite(T.move(Sky, ctx(), '1d', 1).jd));

// ---- Pasos y velocidades PERSONALIZADOS
check('personalizado: customId valida cantidad y unidad (y el id cabe en la cookie)', () => T.customId(15, 'n') === 'x15n' && T.customId(250, 'y') === 'x250y' && T.customId(0, 'd') === null && T.customId(1.5, 'h') === null && T.customId(3, 'z') === null && T.customId(1e10, 'y') === null && T.customId(-2, 'w') === null);
check('personalizado: parseCustom da la misma forma que los pasos fijos (kind, n) y textos en singular/plural', () => {
    const a = T.byId('x15n'), b = T.byId('x3o'), c = T.byId('x1y'), d = T.byId('x25000y');
    return a.kind === 'sec' && a.n === 900 && a.es === '15 minutos' && b.kind === 'month' && b.n === 3 && b.en === '3 months' && c.es === '1 año' && c.en === '1 year' && d.kind === 'year' && d.n === 25000 && /^25.000 años$/.test(d.es) ? true : JSON.stringify([a, b, c, d]);
});
check('personalizado: ids raros se rechazan (null), no rompen', () => ['x0y', 'x15', 'xx', 'x15q', 'x01d', '15n', '', null, undefined, 42, 'x1234567890y'].every((id) => T.byId(id) === null));
check('personalizado: 15 minutos con reloj mueve 15 min exactos; 3 meses usa calendario (31-ene + 3 meses = 30-abr)', () => {
    const c = ctx(); const a = T.move(Sky, c, 'x15n', 1); const b = T.move(Sky, ctx({ jd: jd(2023, 1, 31, 8, 30) }), 'x3o', 1);
    return Math.abs((a.jd - c.jd) * 1440 - 15) < 1e-6 && ymd(b.jd) === '2023-4-30 8:30' ? true : ymd(b.jd);
});
check('personalizado: 250 anos sin reloj mueve 250 anos; 6 horas sin reloj se redondea a 1 ano y avisa', () => { const r = T.move(Sky, ctx({ jd: NaN, ybp: 5e6 }), 'x250y', -1); const q = T.move(Sky, ctx({ jd: NaN, ybp: 5e6 }), 'x6h', -1); return r.ybp === 5e6 + 250 && q.ybp === 5e6 + 1 && q.note === 'minYear'; });
check('velocidad personalizada: 2,5 h/s hacia delante = 9000 s/s; 3 anos/s hacia atras = -3 anos; textos', () => { const a = T.customRate(2.5, 'h', 1), b = T.customRate(3, 'y', -1); return a.v === 9000 && a.es === '2,5 h/s' && b.v === -3 * 31557600 && b.es === '− 3 años/s' && b.en === '− 3 years/s' ? true : JSON.stringify([a, b]); });
check('velocidad personalizada: fuera de [0,1 s/s, 100 anos/s], cero, negativa, NaN o unidad rara se rechazan (null)', () => [[0.05, 's', 1], [101, 'y', 1], [0, 'h', 1], [-2, 'h', 1], [NaN, 'h', 1], [2, 'z', 1], [2, 'h', 0], ['2', 'h', 1]].every((a) => T.customRate(...a) === null) && T.customRate(100, 'y', -1) !== null && T.customRate(0.1, 's', 1) !== null);

console.log(fails ? '\n' + fails + ' prueba(s) con fallo.' : '\nPaso de las flechas: todo verde.');
process.exit(fails ? 1 : 0);
