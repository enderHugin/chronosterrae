#!/usr/bin/env node
// build-search.js - Indice del buscador (data/search/index.json): personas, sucesos y construcciones, con su lugar, su fecha y,
// si la hay, el nombre del archivo de su imagen en Commons (data/images/p18.json).
//
//   node scripts/build-search.js <carpeta de salida>      (lo ejecuta el workflow de Pages al publicar; no se guarda en el repo)
//
// Las personas salen UNA vez (no "nacimiento" y "muerte" por separado): la entrada apunta al nacimiento y lleva la muerte aparte.
// Las entidades politicas no van aqui: sus nombres llegan en ejecucion con el indice de historical-basemaps (GPL, no se copia).
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('../sky/sky.js');
const EI = require('../map/event-icons.js');

const root = path.join(__dirname, '..');
const JD_1950 = 2433282.5;
const r2 = (x) => Math.round(x * 100) / 100;
const r5 = (x) => Math.round(x * 1e5) / 1e5;

/** JD del suceso: el instante si lo hay; si no, mediodia UT del dia (o el centro del intervalo segun la precision). */
function jdOf(tm) {
    if (tm.instant && typeof tm.instant.jd_ut === "number") return tm.instant.jd_ut;
    const mid = (tm.start_ybp + tm.end_ybp) / 2;
    const jd = JD_1950 - mid * 365.25;
    // un dia sin hora: mediodia UT de ese dia (el comienzo del dia es la medianoche, y en medio mundo seria aun el dia anterior)
    return tm.precision === 'day' ? Math.floor(jd - 0.5) + 1 : jd;
}
const yearOfIso = (iso) => { const m = /^(-?\d+)/.exec(iso || ''); return m ? parseInt(m[1], 10) : NaN; };

function build() {
    const imgFile = path.join(root, 'data', 'images', 'p18.json');
    const imgs = fs.existsSync(imgFile) ? JSON.parse(fs.readFileSync(imgFile, 'utf8')).files || {} : {};
    const evDir = path.join(root, 'data', 'events');
    const feats = [];
    for (const f of fs.readdirSync(evDir).filter((x) => /^c\d+\.json$/.test(x))) feats.push(...(JSON.parse(fs.readFileSync(path.join(evDir, f), 'utf8')).features || []));
    const people = new Map(); const rows = [];
    // id: null cuando es el de siempre (wd.<qid>.<tipo>, ver idOf en map/search.js); d: fecha de la muerte (personas)
    const fields = ['id', 'kind', 'icon', 'en', 'es', 'lng', 'lat', 'jd', 'iso', 'imp', 'qid', 'img', 'd', 'ek'];
    const idOrNull = (id, qid, suffix) => (qid && id === 'wd.' + qid.toLowerCase() + '.' + suffix ? null : id);
    for (const ft of feats) {
        // sin lugar (muchos descubrimientos, algunos tratados...): se encuentran igual; al elegirlos cambia la fecha y el mapa no se mueve
        const p = ft.properties; const pt = ft.geometry && ft.geometry.type === 'Point' ? ft.geometry.coordinates : null;
        const src = (p.sources || []).find((s) => s.kind === 'wikidata'); const qid = src ? src.id : null;
        const tm = p.time;
        const at = [p.id, pt ? r5(pt[0]) : null, pt ? r5(pt[1]) : null, r2(jdOf(tm)), tm.iso || null, tm.precision, tm.calendar || null];
        if ((p.kind === 'birth' || p.kind === 'death') && qid) {
            const pe = people.get(qid) || { qid, en: (p.labels && p.labels.en) || p.name, es: p.labels && p.labels.es, imp: p.importance || 0 };
            pe[p.kind] = at; pe.imp = Math.max(pe.imp, p.importance || 0); people.set(qid, pe);
            continue;
        }
        let icon = 'event'; try { icon = EI.classify({ kind: p.kind, name: p.name, classes: p.classes, year: yearOfIso(tm.iso) }).icon; } catch (e) { /* por defecto */ }
        const en = (p.labels && p.labels.en) || p.name; const es = p.labels && p.labels.es;
        rows.push([idOrNull(p.id, qid, p.kind || 'event'), 'event', icon, en, es && es !== en ? es : null, at[1], at[2], at[3], at[4], r2(p.importance || 0), qid, (qid && imgs[qid]) || null, null, p.kind || 'event']);
    }
    for (const pe of people.values()) {
        const main = pe.birth || pe.death; const icon = pe.birth ? 'birth' : 'death';
        const d = pe.birth && pe.death ? pe.death[4] : null;
        rows.push([idOrNull(main[0], pe.qid, icon), 'person', icon, pe.en, pe.es && pe.es !== pe.en ? pe.es : null, main[1], main[2], main[3], main[4], r2(pe.imp), pe.qid, imgs[pe.qid] || null, d, null]);
    }
    const bm = path.join(root, 'data', 'built', 'built-map.json');
    if (fs.existsSync(bm)) {
        const t = JSON.parse(fs.readFileSync(bm, 'utf8')); const ix = Object.fromEntries(t.fields.map((k, i) => [k, i]));
        for (const r of t.rows) {
            const qid = r[ix.qid]; const en = r[ix.en]; const es = r[ix.es];
            rows.push([null, 'built', r[ix.family], en, es && es !== en ? es : null, r[ix.lng], r[ix.lat], r2(JD_1950 - r[ix.start_ybp] * 365.25), r[ix.iso], r[ix.importance], qid, imgs[qid] || null, null, null]);
        }
    }
    rows.sort((a, b) => b[9] - a[9] || (a[10] < b[10] ? -1 : a[10] > b[10] ? 1 : 0));
    return { note: 'Indice del buscador generado al publicar (scripts/build-search.js) a partir de data/events, data/built y data/images. Fuente de los datos: Wikidata (CC0). Las imagenes no estan aqui: solo el nombre del archivo de Commons.', fields, rows };
}
module.exports = { build, jdOf };
if (require.main === module) {
    const out = process.argv[2]; if (!out) { console.error('uso: node scripts/build-search.js <carpeta>'); process.exit(1); }
    const idx = build(); fs.mkdirSync(out, { recursive: true });
    const body = JSON.stringify(idx); fs.writeFileSync(path.join(out, 'index.json'), body + '\n');
    console.error('indice de busqueda:', idx.rows.length, 'entradas,', body.length, 'bytes');
}
