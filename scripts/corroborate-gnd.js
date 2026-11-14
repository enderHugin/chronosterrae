#!/usr/bin/env node
// corroborate-gnd.js - CONTRASTE AUTOMATICO de fechas de vida: lo que dicen nuestras fichas (Wikidata) frente a la GND, el fichero de
// autoridades de la Biblioteca Nacional de Alemania (CC0 desde 2015: docs/FUENTES.md), leida via lobid.org.
//
//   node scripts/corroborate-gnd.js --out data/corroboration/gnd-people.json [--limit 200]
//
// Pedido del creador (2026-11-14): medallas de fiabilidad (bronce, plata, oro, diamante) que suban SOLAS, estudiadas por maquinas, «para
// que cada vez haya, sin esfuerzo de humanos, mas diamantes y oros». Una medalla no la pone la opinion de una IA: la pone un contraste que
// cualquiera puede repetir. Este es el primero:
//  1. Personas de nuestros sucesos (nacimiento y muerte; fuente Wikidata).
//  2. De Wikidata (API wbgetentities, claims): su identificador GND (P227) y, para cada fecha (P569/P570), si la referencia de esa
//     declaracion es la propia GND («stated in» P248 = Q36578, o una URL de d-nb.info). Si lo es, las dos fuentes NO son independientes:
//     coincidir no prueba nada nuevo (cuenta como «la fuente de Wikidata es una autoridad», plata, no como segunda fuente, oro).
//  3. De lobid: dateOfBirth / dateOfDeath de la GND.
//  4. Comparacion al nivel de precision del menos preciso (dia, mes o año). Antes de 1583 solo el año (la GND no dice calendario).
//     Fechas antes de Cristo: no se comparan (formato de la GND sin verificar).
// Salida (CC0, como sus dos fuentes): records[id] = [resultado a|d, fecha GND, id GND, nivel d|m|y, independiente 1|0].
'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'ChronosTerrae-Corroborate/0.1 (https://github.com/enderHugin/chronosterrae)';
const WD_API = 'https://www.wikidata.org/w/api.php';
const LOBID = 'https://lobid.org/gnd/';
const GND_QID = 'Q36578';
const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(...a);

/** Fecha «AAAA[-MM[-DD]]» (con signo opcional) -> { y, m, d, prec: 'y'|'m'|'d' } o null. */
function parseDate(s) {
    const m = /^(-?)(\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(s || '').trim()); if (!m) return null;
    const y = (m[1] ? -1 : 1) * Number(m[2]); const mo = m[3] ? Number(m[3]) : 0; const d = m[4] ? Number(m[4]) : 0;
    if (mo > 12 || d > 31) return null;
    return { y, m: mo, d, prec: d ? 'd' : mo ? 'm' : 'y' };
}
/** Fecha de Wikidata (+1879-03-14T00:00:00Z, precision 9/10/11) -> parseDate a esa precision. */
function wdTime(v) {
    if (!v || typeof v.time !== 'string') return null;
    const m = /^([+-])(\d+)-(\d{2})-(\d{2})/.exec(v.time); if (!m) return null;
    const p = v.precision >= 11 ? 'd' : v.precision === 10 ? 'm' : v.precision === 9 ? 'y' : null; if (!p) return null;
    return { y: (m[1] === '-' ? -1 : 1) * Number(m[2]), m: p === 'y' ? 0 : Number(m[3]), d: p === 'd' ? Number(m[4]) : 0, prec: p };
}
const RANK = { y: 0, m: 1, d: 2 };
/**
 * Compara dos fechas al nivel del menos preciso. Antes de 1583, solo el año. Antes de Cristo: null (no se compara).
 * Devuelve { result: 'a'|'d', level } o null.
 */
function compareDates(a, b) {
    if (!a || !b || a.y <= 0 || b.y <= 0) return null;
    let level = RANK[a.prec] <= RANK[b.prec] ? a.prec : b.prec;
    if (Math.min(a.y, b.y) < 1583) level = 'y';
    const same = a.y === b.y && (level === 'y' || a.m === b.m) && (level !== 'd' || a.d === b.d);
    return { result: same ? 'a' : 'd', level };
}
/** ¿Alguna referencia de esta declaracion es la GND? («stated in» = GND, o URL de d-nb.info). */
function refIsGnd(claim) {
    for (const ref of claim.references || []) {
        const sn = ref.snaks || {};
        if ((sn.P248 || []).some((s) => s.datavalue && s.datavalue.value && s.datavalue.value.id === GND_QID)) return true;
        if ((sn.P854 || []).some((s) => s.datavalue && /d-nb\.info|portal\.dnb\.de/.test(String(s.datavalue.value)))) return true;
        if ((sn.P227 || []).length) return true;
    }
    return false;
}

function collectPeople(root) {
    const dir = path.join(root, 'data', 'events'); const people = new Map();
    for (const f of fs.readdirSync(dir).filter((x) => /^c\d+\.json$/.test(x))) {
        for (const ft of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).features || []) {
            const p = ft.properties; if (p.kind !== 'birth' && p.kind !== 'death') continue;
            const src = (p.sources || []).find((s) => s.kind === 'wikidata' && /^Q\d+$/.test(s.id)); if (!src) continue;
            const e = people.get(src.id) || {}; e[p.kind] = { id: p.id, iso: p.time && p.time.iso, calendar: p.time && p.time.calendar }; people.set(src.id, e);
        }
    }
    return people;
}
async function getJSON(url, tries = 4) {
    for (let i = 0; ; i++) {
        try {
            const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
            if (r.status === 404) return null;
            if ((r.status === 429 || r.status >= 500) && i < tries) { await sleep(4000 * (i + 1)); continue; }
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return await r.json();
        } catch (e) { if (i >= tries) throw e; await sleep(3000 * (i + 1)); }
    }
}
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

async function main() {
    const out = arg('out'); const limit = Number(arg('limit') || 0);
    if (!out) { log('uso: --out <fichero> [--limit n]'); process.exit(2); }
    const root = path.join(__dirname, '..');
    let people = [...collectPeople(root)]; if (limit) people = people.slice(0, limit);
    log('personas con nacimiento o muerte:', people.length);
    // 2. Wikidata: GND (P227) y referencias de P569/P570
    const wd = new Map();
    for (let i = 0; i < people.length; i += 50) {
        const ids = people.slice(i, i + 50).map(([q]) => q);
        const j = await getJSON(WD_API + '?' + new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims', format: 'json' }));
        for (const [q, ent] of Object.entries((j && j.entities) || {})) {
            const c = ent.claims || {}; const gnd = (c.P227 || []).map((s) => s.mainsnak && s.mainsnak.datavalue && s.mainsnak.datavalue.value).filter(Boolean);
            const dates = (prop) => (c[prop] || []).filter((s) => s.rank !== 'deprecated' && s.mainsnak && s.mainsnak.datavalue).map((s) => ({ t: wdTime(s.mainsnak.datavalue.value), gndRef: refIsGnd(s) }));
            wd.set(q, { gnd, birth: dates('P569'), death: dates('P570') });
        }
        if (i % 1000 === 0) log('wikidata', i, '/', people.length);
        await sleep(300);
    }
    // 3 y 4. lobid y comparacion
    const records = {}; const counts = { people: people.length, with_gnd: 0, gnd_read: 0, gnd_missing: 0, compared: 0, agree: 0, disagree: 0, not_independent: 0, not_comparable: 0, unparsed_gnd: 0 };
    const sampleKeys = new Set(); let done = 0;
    const work = people.filter(([q]) => wd.get(q) && wd.get(q).gnd.length);
    counts.with_gnd = work.length;
    const run = async ([q, ours]) => {
        const w = wd.get(q); const gid = w.gnd[0];
        const g = await getJSON(LOBID + encodeURIComponent(gid) + '.json').catch((e) => { log('lobid', gid, e.message); return undefined; });
        if (!g) { counts.gnd_missing++; return; }
        counts.gnd_read++; if (sampleKeys.size < 60) Object.keys(g).forEach((k) => sampleKeys.add(k));
        for (const kind of ['birth', 'death']) {
            if (!ours[kind] || !ours[kind].iso) continue;
            const gv = asList(kind === 'birth' ? g.dateOfBirth : g.dateOfDeath)[0]; if (gv == null) continue;
            const gd = parseDate(gv); if (!gd) { counts.unparsed_gnd++; continue; }
            const mine = parseDate(ours[kind].iso); const cmp = compareDates(mine, gd); if (!cmp) { counts.not_comparable++; continue; }
            // ¿La declaracion de Wikidata con NUESTRA fecha cita a la GND? Entonces no son independientes.
            const st = w[kind].filter((s) => s.t && compareDates(mine, s.t) && compareDates(mine, s.t).result === 'a');
            const independent = st.length ? !st.some((s) => s.gndRef) : true;
            if (!independent) counts.not_independent++;
            counts.compared++; counts[cmp.result === 'a' ? 'agree' : 'disagree']++;
            records[ours[kind].id] = [cmp.result, String(gv), gid, cmp.level, independent ? 1 : 0];
        }
        if (++done % 500 === 0) log('lobid', done, '/', work.length);
    };
    for (let i = 0; i < work.length; i += 6) { await Promise.all(work.slice(i, i + 6).map(run)); await sleep(150); }
    const outObj = {
        meta: {
            what: 'Contraste de fechas de vida: nuestras fichas (Wikidata) frente a la GND. records[id] = [a=coinciden|d=discrepan, fecha GND, id GND, nivel de la comparacion d|m|y, 1=fuentes independientes|0=la declaracion de Wikidata cita a la GND]',
            sources: ['Wikidata (CC0), API wbgetentities: P227 y referencias de P569/P570', 'GND de la Deutsche Nationalbibliothek (CC0 desde 2015) via lobid.org'],
            rules: ['nivel = el del menos preciso', 'antes de 1583 solo el año (la GND no dice calendario)', 'fechas antes de Cristo: no se comparan'],
            generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), counts, lobid_keys_seen: [...sampleKeys].sort()
        },
        records
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(outObj));
    log(JSON.stringify(counts));
    if (counts.gnd_read > 20 && counts.compared === 0) { log('AVISO: se leyeron fichas de la GND pero ninguna fecha se pudo comparar; claves vistas:', [...sampleKeys].join(',')); process.exit(3); }
}

if (require.main === module) main().catch((e) => { log(e); process.exit(1); });
module.exports = { parseDate, wdTime, compareDates, refIsGnd, collectPeople };
