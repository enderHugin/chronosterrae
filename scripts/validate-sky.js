#!/usr/bin/env node
// validate-sky.js - Contrasta sky/sky.js con JPL Horizons (DE441) en muchas epocas.
//
// Necesita internet (Horizons no tiene CORS y desde el entorno de desarrollo no se alcanza), asi que
// corre en el workflow sky-validate.yml. stdout = informe JSON; stderr = progreso.
//
// Que se compara: posicion astrometrica geocentrica (J2000, con tiempo de luz, sin aberracion ni
// refraccion) de Sol, Luna y planetas. Se pide a Horizons en escala TT para que el resultado NO dependa
// del modelo de DeltaT: aqui se mide solo el error de la efemeride. El efecto de DeltaT en la
// orientacion de la Tierra (y por tanto en el cielo local) se declara aparte en la interfaz.
//
// Regla del proyecto: no se asume el formato de una API externa. Si Horizons responde con algo
// inesperado, el informe lo dice en vez de inventar un resultado.

'use strict';

const A = require('astronomy-engine');
const S = require('../sky/sky.js');

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const USER_AGENT = 'ChronosTerrae-Validate/0.1 (https://github.com/enderHugin/chronosterrae)';
const TIMEOUT_MS = 60000;

const YEARS = [-2000, -1500, -1000, -500, 0, 500, 1000, 1500, 1700, 1900, 2000, 2026, 2100, 2300, 2600, 3000];
const BODIES = [
    { id: 'Sun', cmd: '10' }, { id: 'Moon', cmd: '301' }, { id: 'Mercury', cmd: '199' }, { id: 'Venus', cmd: '299' },
    // Horizons solo tiene el CENTRO de Marte y los gigantes desde 1600-1800; el baricentro de su sistema
    // (4..8) existe en toda la efemeride DE441 y difiere del planeta en kilometros (< 0,01 segundos de arco).
    { id: 'Mars', cmd: '4' }, { id: 'Jupiter', cmd: '5' }, { id: 'Saturn', cmd: '6' },
    { id: 'Uranus', cmd: '7' }, { id: 'Neptune', cmd: '8' }
];

const log = (...a) => console.error(...a);
const describe = (err) => err.message + (err.cause ? ' [' + (err.cause.code || err.cause.name || '') + ' ' + (err.cause.message || '') + ']' : '');

// Instante de cada epoca: 21 de junio a las 12:00, en el calendario que corresponde (juliano antes de 1582).
const epochs = YEARS.map((year) => {
    const { jd, calendar } = S.calendarToJD({ year, month: 6, day: 21, hour: 12 });
    return { year, jd, calendar };
});

async function horizons(cmd, jds, timeType) {
    const q = new URLSearchParams({
        format: 'json', COMMAND: `'${cmd}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
        CENTER: "'500@399'", TLIST_TYPE: "'JD'", TLIST: jds.map((j) => `'${j.toFixed(6)}'`).join(' '),
        QUANTITIES: "'1'", ANG_FORMAT: "'DEG'", CSV_FORMAT: "'YES'", TIME_TYPE: `'${timeType}'`
    });
    const res = await fetch(API + '?' + q.toString(), { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    if (!res.ok) throw new Error('Horizons HTTP ' + res.status + ': ' + text.slice(0, 300));
    const json = JSON.parse(text);
    if (typeof json.result !== 'string') throw new Error('respuesta sin "result": ' + text.slice(0, 300));
    return json.result;
}

// Extrae (fecha, RA, DEC) del bloque $$SOE..$$EOE usando la cabecera para localizar las columnas.
function parseTable(result) {
    const lines = result.split('\n');
    const soe = lines.findIndex((l) => l.includes('$$SOE'));
    const eoe = lines.findIndex((l) => l.includes('$$EOE'));
    if (soe < 0 || eoe < 0) throw new Error('sin tabla $$SOE/$$EOE: ' + result.slice(0, 400).replace(/\n/g, ' | '));
    let header = null;
    for (let i = soe - 1; i >= 0; i--) { if (/R\.A\./.test(lines[i])) { header = lines[i]; break; } }
    if (!header) throw new Error('sin cabecera con R.A.');
    const cols = header.split(',').map((c) => c.trim());
    const iRa = cols.findIndex((c) => /^R\.A\./.test(c));
    const iDec = cols.findIndex((c) => /^DEC/.test(c));
    const iDate = 0;
    if (iRa < 0 || iDec < 0) throw new Error('columnas RA/DEC no encontradas en: ' + header);
    return lines.slice(soe + 1, eoe).filter((l) => l.trim()).map((l) => {
        const f = l.split(',').map((c) => c.trim());
        return { date: f[iDate], ra: parseFloat(f[iRa]), dec: parseFloat(f[iDec]) };
    });
}

const toRad = (d) => d * Math.PI / 180;
function separationArcsec(ra1, dec1, ra2, dec2) {
    // formula de Vincenty: estable para separaciones pequenas
    const l = toRad(ra2 - ra1);
    const [p1, p2] = [toRad(dec1), toRad(dec2)];
    const y = Math.hypot(Math.cos(p2) * Math.sin(l), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l));
    const x = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(l);
    return Math.atan2(y, x) * 180 / Math.PI * 3600;
}

// Posicion astrometrica geocentrica J2000 que calcula sky.js/astronomy-engine a partir de TT.
function engineRaDec(bodyId, jdTT) {
    const time = A.AstroTime.FromTerrestrialTime(jdTT - S.J2000_JD);
    const v = A.GeoVector(A.Body[bodyId], time, false);
    const eq = A.EquatorFromVector(v);
    return { ra: eq.ra * 15, dec: eq.dec };
}

async function main() {
    const report = {
        generated_at: new Date().toISOString(),
        reference: 'JPL Horizons (https://ssd.jpl.nasa.gov/api/horizons.api), geocentrico, astrometrico J2000, escala TT',
        engine: 'astronomy-engine ' + require('../package.json').devDependencies['astronomy-engine'],
        epochs: epochs.map((e) => ({ year: e.year, calendar: e.calendar, jd: e.jd })),
        cases: [],
        errors: []
    };
    // En TT el instante del calendario se interpreta como TT para que no intervenga DeltaT.
    const jds = epochs.map((e) => e.jd);
    for (const b of BODIES) {
        try {
            const result = await horizons(b.cmd, jds, 'TT');
            if (!report.sample_header) report.sample_header = result.split('\n').slice(0, 30).join('\n');
            const rows = parseTable(result);
            if (rows.length !== epochs.length) throw new Error(`filas ${rows.length} != epocas ${epochs.length}`);
            rows.forEach((row, i) => {
                const mine = engineRaDec(b.id, epochs[i].jd);
                const err = separationArcsec(row.ra, row.dec, mine.ra, mine.dec);
                report.cases.push({ body: b.id, year: epochs[i].year, horizons_ra: row.ra, horizons_dec: row.dec, engine_ra: +mine.ra.toFixed(6), engine_dec: +mine.dec.toFixed(6), error_arcsec: +err.toFixed(3) });
            });
            log('OK  ', b.id.padEnd(8), rows.length, 'epocas');
        } catch (err) {
            report.errors.push({ body: b.id, error: describe(err) });
            log('XX  ', b.id.padEnd(8), describe(err));
        }
        await new Promise((r) => setTimeout(r, 800));
    }
    // Resumen: error maximo por cuerpo y por franja de epocas
    const bands = [
        { id: '1700-2200', test: (y) => y >= 1700 && y <= 2200 },
        { id: '0-1699', test: (y) => y >= 0 && y < 1700 },
        { id: 'antes de 0', test: (y) => y < 0 },
        { id: 'despues de 2200', test: (y) => y > 2200 }
    ];
    report.summary = {};
    for (const b of BODIES) {
        report.summary[b.id] = {};
        for (const band of bands) {
            const errs = report.cases.filter((c) => c.body === b.id && band.test(c.year)).map((c) => c.error_arcsec);
            report.summary[b.id][band.id] = errs.length ? +Math.max(...errs).toFixed(2) : null;
        }
    }
    report.units = 'segundos de arco; error maximo de la posicion geocentrica astrometrica en cada franja';
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.cases.length) process.exitCode = 1;   // Horizons no dio nada utilizable
}

main().catch((err) => { log('[ERR] ' + describe(err)); process.exitCode = 1; });
