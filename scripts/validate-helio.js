#!/usr/bin/env node
// validate-helio.js - Contrasta las posiciones HELIOCENTRICAS (km) que usa la vista del sistema solar con JPL Horizons (DE441).
//
// Necesita internet (Horizons no tiene CORS y desde el entorno de desarrollo no se alcanza): corre en helio-validate.yml.
// stdout = informe JSON; stderr = progreso.
//
// Que se compara: vector de posicion GEOMETRICO (sin tiempo de luz) respecto al centro del Sol (la Luna, respecto al centro de la
// Tierra), marco ICRF/J2000 ecuatorial, unidades km. El instante se pide en escala TT para que no intervenga DeltaT. El motor
// (astronomy-engine) usa su marco EQJ (J2000 medio); la diferencia con ICRF es de ~20 mas y esta por debajo de lo medido.
// Marte y los gigantes se piden como BARICENTRO de su sistema (existe en toda la efemeride DE441); el motor da el planeta: la
// diferencia incluye el desplazamiento centro-baricentro, y el informe lo declara.
//
// Regla del proyecto: no se asume el formato de una API externa. Las columnas se localizan por su cabecera; si algo no cuadra,
// el informe lo dice en vez de inventar un resultado.

'use strict';

const A = require('astronomy-engine');
const S = require('../sky/sky.js');

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const USER_AGENT = 'ChronosTerrae-Validate/0.1 (https://github.com/enderHugin/chronosterrae)';
const TIMEOUT_MS = 60000;
const AU_KM = 149597870.7;

const YEARS = [-2000, -1500, -1000, -500, 0, 500, 1000, 1500, 1700, 1900, 2000, 2026, 2100, 2300, 2600, 3000];
// center: respecto a que se mide (Sol = '500@10', Tierra = '500@399'). barycenter: el id de Horizons es el del baricentro del sistema.
const BODIES = [
    { id: 'Mercury', cmd: '199', center: '500@10' }, { id: 'Venus', cmd: '299', center: '500@10' }, { id: 'Earth', cmd: '399', center: '500@10' },
    { id: 'Moon', cmd: '301', center: '500@399' },
    { id: 'Mars', cmd: '4', center: '500@10', barycenter: true }, { id: 'Jupiter', cmd: '5', center: '500@10', barycenter: true },
    { id: 'Saturn', cmd: '6', center: '500@10', barycenter: true }, { id: 'Uranus', cmd: '7', center: '500@10', barycenter: true },
    { id: 'Neptune', cmd: '8', center: '500@10', barycenter: true }
];

const log = (...a) => console.error(...a);
const describe = (err) => err.message + (err.cause ? ' [' + (err.cause.code || err.cause.name || '') + ' ' + (err.cause.message || '') + ']' : '');

const epochs = YEARS.map((year) => { const { jd, calendar } = S.calendarToJD({ year, month: 6, day: 21, hour: 12 }); return { year, jd, calendar }; });

async function horizons(b, jds, timeType) {
    const q = new URLSearchParams({
        format: 'json', COMMAND: `'${b.cmd}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'",
        CENTER: `'${b.center}'`, REF_PLANE: "'FRAME'", REF_SYSTEM: "'ICRF'", OUT_UNITS: "'KM-S'", VEC_TABLE: "'1'", VEC_CORR: "'NONE'",
        TLIST_TYPE: "'JD'", TLIST: jds.map((j) => `'${j.toFixed(6)}'`).join(' '), CSV_FORMAT: "'YES'", TIME_TYPE: `'${timeType}'`
    });
    const res = await fetch(API + '?' + q.toString(), { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    if (!res.ok) throw new Error('Horizons HTTP ' + res.status + ': ' + text.slice(0, 300));
    const json = JSON.parse(text);
    if (typeof json.result !== 'string') throw new Error('respuesta sin "result": ' + text.slice(0, 300));
    return json.result;
}

// (X, Y, Z) en km del bloque $$SOE..$$EOE; las columnas se buscan por su nombre en la cabecera.
function parseVectors(result) {
    const lines = result.split('\n');
    const soe = lines.findIndex((l) => l.includes('$$SOE'));
    const eoe = lines.findIndex((l) => l.includes('$$EOE'));
    if (soe < 0 || eoe < 0) throw new Error('sin tabla $$SOE/$$EOE: ' + result.slice(0, 400).replace(/\n/g, ' | '));
    let header = null;
    for (let i = soe - 1; i >= 0; i--) { const c = lines[i].split(',').map((x) => x.trim()); if (c.includes('X') && c.includes('Y') && c.includes('Z')) { header = c; break; } }
    if (!header) throw new Error('sin cabecera con X, Y, Z');
    const [ix, iy, iz] = ['X', 'Y', 'Z'].map((n) => header.indexOf(n));
    const unitsOk = /KM/i.test(result.slice(0, result.indexOf('$$SOE')));
    const rows = lines.slice(soe + 1, eoe).filter((l) => l.trim()).map((l) => { const f = l.split(',').map((c) => c.trim()); return [parseFloat(f[ix]), parseFloat(f[iy]), parseFloat(f[iz])]; });
    if (rows.some((r) => r.some((v) => !Number.isFinite(v)))) throw new Error('valores no numericos en la tabla');
    return { rows, unitsOk };
}

// Vector que calcula el motor (geometrico, EQJ), en km.
function engineVector(id, jdTT) {
    const time = A.AstroTime.FromTerrestrialTime(jdTT - S.J2000_JD);
    const v = id === 'Moon' ? A.GeoVector('Moon', time, false) : A.HelioVector(A.Body[id], time);
    return [v.x * AU_KM, v.y * AU_KM, v.z * AU_KM];
}

async function main() {
    const report = {
        generated_at: new Date().toISOString(),
        reference: 'JPL Horizons (https://ssd.jpl.nasa.gov/api/horizons.api), vectores geometricos, ICRF/J2000 ecuatorial, km, escala TT; centro: Sol (Luna: Tierra)',
        engine: 'astronomy-engine ' + require('../package.json').devDependencies['astronomy-engine'],
        note: 'Marte y los gigantes: Horizons es el BARICENTRO de su sistema; el motor da el planeta. El error incluye ese desplazamiento.',
        epochs: epochs.map((e) => ({ year: e.year, calendar: e.calendar, jd: e.jd })), cases: [], errors: []
    };
    const jds = epochs.map((e) => e.jd);
    for (const b of BODIES) {
        try {
            const result = await horizons(b, jds, 'TT');
            if (!report.sample_header) report.sample_header = result.split('\n').slice(0, 40).join('\n');
            const { rows, unitsOk } = parseVectors(result);
            if (!unitsOk) throw new Error('la respuesta no declara kilometros');
            if (rows.length !== epochs.length) throw new Error(`filas ${rows.length} != epocas ${epochs.length}`);
            rows.forEach((row, i) => {
                const mine = engineVector(b.id, epochs[i].jd);
                const err = Math.hypot(row[0] - mine[0], row[1] - mine[1], row[2] - mine[2]);
                const dist = Math.hypot(row[0], row[1], row[2]);
                report.cases.push({ body: b.id, year: epochs[i].year, barycenter: Boolean(b.barycenter), distance_km: Math.round(dist), error_km: +err.toFixed(1), error_arcsec: +(err / dist * 206264.806).toFixed(3) });
            });
            log('OK  ', b.id.padEnd(8), rows.length, 'epocas');
        } catch (err) {
            report.errors.push({ body: b.id, error: describe(err) });
            log('XX  ', b.id.padEnd(8), describe(err));
        }
        await new Promise((r) => setTimeout(r, 800));
    }
    const bands = [
        { id: '1700-2200', test: (y) => y >= 1700 && y <= 2200 }, { id: '0-1699', test: (y) => y >= 0 && y < 1700 },
        { id: 'antes de 0', test: (y) => y < 0 }, { id: 'despues de 2200', test: (y) => y > 2200 }
    ];
    report.summary = {};
    for (const b of BODIES) {
        report.summary[b.id] = {};
        for (const band of bands) {
            const errs = report.cases.filter((c) => c.body === b.id && band.test(c.year)).map((c) => c.error_km);
            report.summary[b.id][band.id] = errs.length ? Math.round(Math.max(...errs)) : null;
        }
    }
    report.units = 'km; error maximo del vector de posicion en cada franja (error_arcsec = ese error visto desde el centro de referencia)';
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.cases.length) process.exitCode = 1;
}

main().catch((err) => { log('[ERR] ' + describe(err)); process.exitCode = 1; });
