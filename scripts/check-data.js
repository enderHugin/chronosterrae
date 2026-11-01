#!/usr/bin/env node
// check-data.js - Coherencia de los sucesos masivos (data/events o la salida de build-events.js).
//
//   node scripts/check-data.js [carpeta] [--drop] [--report ruta.json]
//
// Dos niveles, que no se mezclan:
//   · ERRORES NUESTROS (hard): la fecha escrita (iso, calendario) no coincide con los años-antes-del-presente
//     calculados, o el siglo no coincide con el fichero. Son fallos de conversion del proyecto: salida 1.
//   · ANOMALIAS DE LOS DATOS (anomalies): lo que dice Wikidata pero no puede ser cierto o es muy dudoso
//     (muerte antes que nacimiento, edad imposible, fecha futura en un hecho pasado). No se corrigen ni se
//     adivinan: con --drop se sacan de los ficheros para que no entren sin revision, y quedan en el informe.
// Regla: nunca se "arregla" un dato; se separa y se cuenta.

'use strict';

const fs = require('fs');
const path = require('path');
const S = require('../sky/sky.js');

const JD_1950 = 2433282.5;
const MAX_HUMAN_AGE_Y = 123;       // el record documentado (Jeanne Calment) es 122 años y 164 dias: por encima, el dato es dudoso
const ybpOf = (jd) => (JD_1950 - jd) / 365.25;
const yearsOf = (tm) => [1950 - tm.start_ybp, 1950 - tm.end_ybp];   // [inicio, fin] en años

function isoToSpan(iso, cal) {
    const m = /^(-?\d{4,})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(iso || '');
    if (!m) return null;
    const year = parseInt(m[1], 10);
    if (m[3]) { const jd = S.calendarToJD({ year, month: +m[2], day: +m[3] }, cal).jd; return [jd, jd]; }
    if (m[2]) { const a = S.calendarToJD({ year, month: +m[2], day: 1 }, cal).jd; const b = +m[2] === 12 ? S.calendarToJD({ year: year + 1, month: 1, day: 1 }, cal).jd : S.calendarToJD({ year, month: +m[2] + 1, day: 1 }, cal).jd; return [a, b]; }
    return [S.calendarToJD({ year, month: 1, day: 1 }, cal).jd, S.calendarToJD({ year: year + 1, month: 1, day: 1 }, cal).jd];
}

/** feats: [{feature, file}] -> { hard, anomalies, warnings, drop:Set(ids) } */
function analyze(feats, nowYear) {
    const hard = []; const anomalies = []; const warnings = []; const drop = new Set();
    const byQ = new Map(); const seenKey = new Map();
    for (const { feature: f, file } of feats) {
        const p = f.properties; const tm = p.time;
        if (!tm.instant) {
            let span = null;
            try { span = isoToSpan(tm.iso, tm.calendar); } catch (e) { hard.push({ id: p.id, why: 'fecha inconvertible: ' + e.message }); continue; }
            if (!span) { hard.push({ id: p.id, why: 'iso ilegible: ' + tm.iso }); continue; }
            if (Math.abs(ybpOf(span[0]) - tm.start_ybp) > 1e-3 || Math.abs(ybpOf(span[1]) - tm.end_ybp) > 1e-3) hard.push({ id: p.id, why: 'iso y años-antes-del-presente no coinciden (' + tm.iso + ' ' + tm.calendar + ')' });
        }
        const [y0, y1] = yearsOf(tm);
        if (file && /^c(m?)(\d+)\.json$/.test(file)) {
            const mm = /^c(m?)(\d+)\.json$/.exec(file); const century = (mm[1] ? -1 : 1) * +mm[2];
            if (Math.floor((y0 + y1) / 2 / 100) !== century) hard.push({ id: p.id, why: 'esta en el fichero ' + file + ' pero su fecha es ' + tm.iso });
        }
        // anomalias de los datos
        if (y0 > nowYear + 1 && p.kind !== 'event') anomalies.push({ id: p.id, name: p.name, why: 'fecha futura (' + tm.iso + ') en un suceso de tipo ' + p.kind });
        const qid = (/^wd\.(q\d+)\./.exec(p.id) || [])[1];
        if (qid && (p.kind === 'birth' || p.kind === 'death')) { if (!byQ.has(qid)) byQ.set(qid, {}); (byQ.get(qid)[p.kind] = byQ.get(qid)[p.kind] || []).push({ f, y0, y1 }); }
        const key = [p.kind, p.name, tm.iso].join('|');
        if (seenKey.has(key) && seenKey.get(key) !== p.id) warnings.push({ id: p.id, name: p.name, why: 'duplicado probable de ' + seenKey.get(key) }); else seenKey.set(key, p.id);
    }
    // Una persona puede tener varias declaraciones (p. ej. dos fechas de muerte). Solo se aparta la que no
    // concuerda con NINGUNA del otro lado: asi una muerte erronea no arrastra a un nacimiento correcto.
    const verdict = (b, d) => {
        if (d.y1 < b.y0) return 'murio (' + d.f.properties.time.iso + ') antes de nacer (' + b.f.properties.time.iso + ')';
        if (d.y0 - b.y1 > MAX_HUMAN_AGE_Y) return 'edad de ' + Math.round(d.y0 - b.y1) + ' años (' + b.f.properties.time.iso + ' a ' + d.f.properties.time.iso + ')';
        return null;
    };
    for (const [qid, v] of byQ) {
        if (!v.birth || !v.death) continue;
        for (const side of ['birth', 'death']) {
            const other = side === 'birth' ? 'death' : 'birth';
            for (const x of v[side]) {
                const why = []; let anyOk = false;
                for (const y of v[other]) { const r = side === 'birth' ? verdict(x, y) : verdict(y, x); if (r) why.push(r); else anyOk = true; }
                if (!anyOk && why.length) { anomalies.push({ id: x.f.properties.id, name: x.f.properties.name, why: why[0] + (why.length > 1 ? ' (+' + (why.length - 1) + ' mas)' : '') }); drop.add(x.f.properties.id); }
            }
        }
    }
    anomalies.forEach((a) => drop.add(a.id));
    return { hard, anomalies, warnings, drop };
}

function main() {
    const args = process.argv.slice(2);
    const flag = (n) => args.includes('--' + n);
    const val = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
    const dir = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--report') || path.join(__dirname, '../data/events'));
    const files = fs.readdirSync(dir).filter((n) => /^c(m?)\d+\.json$/.test(n));
    const feats = [];
    for (const file of files) for (const feature of JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).features) feats.push({ feature, file });
    const r = analyze(feats, new Date().getUTCFullYear());
    const report = { checked: feats.length, hard: r.hard.length, anomalies: r.anomalies.length, warnings: r.warnings.length, details: { hard: r.hard.slice(0, 50), anomalies: r.anomalies.slice(0, 200), warnings: r.warnings.slice(0, 50) } };
    if (flag('drop') && r.drop.size) {
        const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
        for (const file of files) {
            const fc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            const kept = fc.features.filter((f) => !r.drop.has(f.properties.id));
            if (kept.length === fc.features.length) continue;
            fs.writeFileSync(path.join(dir, file), JSON.stringify({ type: 'FeatureCollection', features: kept }) + '\n');
            const key = file.replace(/\.json$/, '');
            if (idx.shards[key]) { idx.shards[key].count = kept.length; idx.shards[key].bytes = fs.statSync(path.join(dir, file)).size; }
        }
        fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(idx, null, 1) + '\n');
        report.dropped = r.drop.size;
    }
    if (val('report')) fs.writeFileSync(val('report'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ checked: report.checked, hard: report.hard, anomalies: report.anomalies, warnings: report.warnings, dropped: report.dropped || 0 }));
    r.hard.slice(0, 10).forEach((h) => console.error('ERROR  ' + h.id + ': ' + h.why));
    r.anomalies.slice(0, 10).forEach((a) => console.error('ANOMALIA  ' + a.id + ' ' + a.name + ': ' + a.why));
    if (r.hard.length) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { analyze, isoToSpan };
