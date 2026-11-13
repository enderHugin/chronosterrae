#!/usr/bin/env node
// probe-sources.js - Sonda del INVENTARIO de fuentes (docs/FUENTES.md): para cada candidata, ¿responde?, ¿que licencia DICE su propia pagina?
// y, si tiene API o descarga, ¿devuelve lo esperado y con que CORS?
//
// Uso (en GitHub Actions, que tiene internet completo): node scripts/probe-sources.js > sources.json
//
// Regla 6 del proyecto: no se supone el comportamiento de una API externa; se mide. Regla 7: el resultado distingue «la pagina responde y
// NO dice esa licencia» (licence_found: []) de «la pagina no se pudo leer» (ok: false, error). Lo que se anota de la licencia son las
// FRASES de la propia pagina (extractos), no una conclusion: la conclusion la escribe una persona (o un agente que las lee) en FUENTES.md.
'use strict';

const ORIGIN = 'https://enderhugin.github.io';
const UA = 'ChronosTerrae-SourcesProbe/0.1 (https://github.com/enderHugin/chronosterrae)';
const TIMEOUT_MS = 30000;

// Patrones de licencia que se buscan en el texto de la pagina (se anota cual aparece y un extracto alrededor).
const LICENCES = [
    ['CC0', /\bCC0\b|CC-?Zero|Public Domain Dedication/i],
    ['CC BY 4.0', /CC[ -]BY[ -]4\.0|Creative Commons Attribution 4\.0/i],
    ['CC BY 3.0', /CC[ -]BY[ -]3\.0|Creative Commons Attribution 3\.0/i],
    ['CC BY-SA', /CC[ -]BY[ -]SA|Attribution[- ]ShareAlike/i],
    ['NC (no comercial)', /CC[ -]BY[ -]NC|NonCommercial|non-commercial|not to be used for any commercial/i],
    ['ODbL', /\bODbL\b|Open Database License/i],
    ['GPL', /\bGPL\b|General Public License/i],
    ['Etalab', /etalab/i],
    ['dominio publico', /public domain/i],
    ['pide cita', /please cite|cite (this|the) (data|database)|should cite|always cite/i]
];

// id, que_es (tipo de dato), licence_url (pagina donde la fuente declara su licencia), data_url (muestra de datos; opcional), expect (texto -> bool)
const json = (...keys) => (t) => { try { const j = JSON.parse(t); return keys.every((k) => k.split('.').reduce((n, p) => (n == null ? n : n[p]), j) !== undefined); } catch (e) { return false; } };
const TARGETS = [
    { id: 'ucdp', what: 'conflictos (GED 1989-, fin de conflictos)', licence_url: 'https://ucdp.uu.se/downloads/', data_url: 'https://ucdpapi.pcr.uu.se/api/gedevents/25.1?pagesize=1', expect: json('Result') },
    { id: 'cliopatria', what: 'fronteras (polities -3400..2024, CC BY 4.0 medido en su LICENSE.md)', licence_url: 'https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/main/LICENSE.md' },
    { id: 'seshat', what: 'variables de sociedades historicas', licence_url: 'https://seshat-db.com/' },
    { id: 'ohm', what: 'fronteras y lugares fechados (OpenHistoricalMap)', licence_url: 'https://www.openhistoricalmap.org/copyright', data_url: 'https://vtiles.openhistoricalmap.org/maps/osm/0/0/0.pbf' },
    { id: 'cshapes', what: 'fronteras de estados 1886-', licence_url: 'https://icr.ethz.ch/data/cshapes/' },
    { id: 'notable-people', what: 'personas (Laouenan et al. 2022, 2,2 M)', licence_url: 'https://data.sciencespo.fr/api/datasets/:persistentId/?persistentId=doi:10.21410/7E4/YLG6YR', expect: json('data.latestVersion') },
    { id: 'gnd-lobid', what: 'personas (fichero de autoridades GND)', licence_url: 'https://lobid.org/gnd/api', data_url: 'https://lobid.org/gnd/search?q=Albert+Einstein&filter=type:Person&format=json&size=1', expect: json('member') },
    { id: 'pleiades', what: 'lugares antiguos', licence_url: 'https://api.github.com/repos/isawnyu/pleiades.datasets/license', expect: json('license.spdx_id') },
    { id: 'geonames', what: 'lugares actuales', licence_url: 'https://www.geonames.org/about.html' },
    { id: 'whg', what: 'lugares historicos (World Historical Gazetteer)', licence_url: 'https://whgazetteer.org/' },
    { id: 'noaa-earthquakes', what: 'terremotos significativos (-2150-)', licence_url: 'https://www.ncei.noaa.gov/products/natural-hazards/tsunamis-earthquakes-volcanoes/earthquakes', data_url: 'https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/earthquakes?minYear=-2150&maxYear=-1000', expect: json('items') },
    { id: 'gvp', what: 'volcanes y erupciones del Holoceno (Smithsonian)', licence_url: 'https://volcano.si.edu/gvp_votw.cfm' },
    { id: 'eventkg', what: 'sucesos (grafo de conocimiento)', licence_url: 'https://eventkg.l3s.uni-hannover.de/' },
    { id: 'nasa-eclipses', what: 'eclipses -1999..3000 (Espenak)', licence_url: 'https://eclipse.gsfc.nasa.gov/SEcat5/SEcatalog.html' },
    // Segunda ronda (2026-11-14, «si no estas seguro busca mas fuentes»)
    { id: 'hced', what: 'batallas y sucesos de guerra con coordenadas, -1468..2003 (Miller 2022)', licence_url: 'https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/6ZFC0V', expect: json('data.latestVersion') },
    { id: 'histogis', what: 'unidades politicas y administrativas de Europa con fechas, ~1815-1919', licence_url: 'https://arche.acdh.oeaw.ac.at/browser/oeaw_detail/105578' },
    { id: 'eventkg-zenodo', what: 'sucesos (grafo de conocimiento), registro de Zenodo', licence_url: 'https://zenodo.org/api/records/10424118', expect: json('metadata.license') },
    { id: 'gnd-dnb', what: 'personas (GND): nota de la DNB sobre CC0', licence_url: 'https://www.dnb.de/EN/Ueber-uns/Presse/ArchivPM2015/metadatenCC0.html' },
    { id: 'cliopatria-zenodo', what: 'fronteras (Cliopatria), registro de Zenodo', licence_url: 'https://zenodo.org/api/records/13363121', expect: json('metadata.license') }
];

async function get(url) {
    const t0 = Date.now(); const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(url, { headers: { 'User-Agent': UA, Origin: ORIGIN, Accept: 'application/json, text/html;q=0.9, */*;q=0.5' }, signal: ac.signal, redirect: 'follow' });
        const buf = Buffer.from(await r.arrayBuffer());
        return { ok: r.ok, status: r.status, final_url: r.url, ms: Date.now() - t0, bytes: buf.length, type: r.headers.get('content-type'), cors: r.headers.get('access-control-allow-origin'), text: buf.toString('utf8') };
    } catch (e) { return { ok: false, error: String(e && e.name === 'AbortError' ? 'tiempo agotado' : e.message || e), ms: Date.now() - t0 }; } finally { clearTimeout(tm); }
}
/** Texto plano (sin etiquetas) para buscar frases. */
const plain = (s) => String(s || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
function licenceFindings(text) {
    const p = plain(text); const out = [];
    for (const [name, re] of LICENCES) { const m = re.exec(p); if (m) out.push({ licence: name, excerpt: p.slice(Math.max(0, m.index - 140), m.index + m[0].length + 140).trim() }); }
    return out;
}

async function main() {
    const results = [];
    for (const t of TARGETS) {
        const lic = await get(t.licence_url);
        const row = { id: t.id, what: t.what, licence_url: t.licence_url, licence_page: { ok: lic.ok, status: lic.status, error: lic.error, final_url: lic.final_url, ms: lic.ms, bytes: lic.bytes }, licence_found: lic.ok ? licenceFindings(lic.text) : null };
        if (lic.ok && t.expect && !t.data_url) row.licence_page.shape_ok = t.expect(lic.text);
        if (lic.ok && /api\.github\.com|data\.sciencespo|dataverse|zenodo\.org\/api/.test(t.licence_url)) row.licence_json_excerpt = lic.text.slice(0, 4000);
        if (t.data_url) {
            const d = await get(t.data_url);
            row.data = { url: t.data_url, ok: d.ok, status: d.status, error: d.error, ms: d.ms, bytes: d.bytes, type: d.type, cors: d.cors, shape_ok: d.ok && t.expect ? t.expect(d.text) : undefined, sample: d.ok && /json/.test(d.type || '') ? d.text.slice(0, 800) : undefined };
        }
        results.push(row);
        console.error(t.id, lic.ok ? 'licencia: ' + (row.licence_found.map((f) => f.licence).join(', ') || '(no dice ninguna de las buscadas)') : 'pagina NO leida: ' + (lic.error || lic.status), row.data ? '| datos: ' + (row.data.ok ? 'ok ' + row.data.bytes + ' B, CORS ' + row.data.cors + ', forma ' + row.data.shape_ok : 'fallo ' + (row.data.error || row.data.status)) : '');
    }
    process.stdout.write(JSON.stringify({ generated_at: new Date().toISOString(), note: 'licence_found = frases de la propia pagina, no conclusiones; licence_found [] = la pagina se leyo y no menciona ninguna licencia buscada; licence_page.ok false = no se pudo leer (no es lo mismo)', results }, null, 1));
}

if (require.main === module) main();
module.exports = { licenceFindings, plain, LICENCES, TARGETS };
