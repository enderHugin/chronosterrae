#!/usr/bin/env node
// probe.js - Sonda de fuentes externas.
//
// Para cada fuente que ChronosTerrae quiere federar, comprueba desde el runner de
// GitHub (que tiene internet) tres cosas:
//   1. Responde y devuelve algo con la forma esperada.
//   2. Permite uso desde el navegador: se envia Origin de la web publicada y se anota
//      Access-Control-Allow-Origin. Sin CORS, el navegador no puede llamarla directamente.
//   3. Cuanto tarda y cuanto pesa.
//
// stdout = JSON con los resultados. stderr = progreso.
// Uso: node scripts/probe.js > probe.json

const ORIGIN = 'https://enderhugin.github.io';
const TIMEOUT_MS = 25000;
const USER_AGENT = 'ChronosTerrae-Probe/0.1 (https://github.com/enderHugin/chronosterrae)';
const HB_COMMIT = 'da7a4b735ecef70aebdc9c73e409d8a2500d50f3';

const wikidataQuery = `SELECT ?p ?pLabel WHERE {
  ?p wdt:P569 ?d . FILTER(?d = "1756-01-27T00:00:00Z"^^xsd:dateTime)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 5`;

// expect: funcion que recibe el texto de la respuesta y devuelve true si tiene la forma esperada.
const jsonHas = (...keys) => (text) => {
    try {
        let node = JSON.parse(text);
        return keys.every((k) => (Array.isArray(node) ? node.length > 0 : k in node));
    } catch (err) {
        return false;
    }
};

// Imagen binaria: se comprueba la firma del archivo (no se lee como texto, que la corrompe).
const isImage = (kind) => (buf) => (kind === 'jpeg' ? buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff : kind === 'png' ? buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 : false);

const targets = [
    { id: 'gplates-coastlines', area: 'paleogeografia', url: 'https://gws.gplates.org/reconstruct/coastlines/?time=250&model=MERDITH2021', full: true, expect: jsonHas('features') },
    { id: 'gplates-coastlines-default-model', area: 'paleogeografia', url: 'https://gws.gplates.org/reconstruct/coastlines/?time=250', full: true, expect: jsonHas('features') },
    { id: 'gplates-coastlines-0ma', area: 'paleogeografia', url: 'https://gws.gplates.org/reconstruct/coastlines/?time=0', full: true, expect: jsonHas('features') },
    { id: 'gplates-coastlines-merdith-500ma', area: 'paleogeografia', url: 'https://gws.gplates.org/reconstruct/coastlines/?time=500&model=MERDITH2021', full: true, expect: jsonHas('features') },
    { id: 'gplates-model-list', area: 'paleogeografia', url: 'https://gws.gplates.org/info/model_list', expect: (t) => t.length > 2 },
    { id: 'gplates-static-polygons-250ma', area: 'paleogeografia', url: 'https://gws.gplates.org/reconstruct/static_polygons/?time=250&model=MERDITH2021', expect: jsonHas('features') },
    { id: 'macrostrat-intervals', area: 'geologia', url: 'https://macrostrat.org/api/v2/defs/intervals?name=Permian', expect: jsonHas('success') },
    { id: 'pbdb-occurrences', area: 'fosiles', url: 'https://paleobiodb.org/data1.2/occs/list.json?base_name=Dinosauria&interval=Maastrichtian&limit=3&show=coords', expect: jsonHas('records') },
    { id: 'gbif-occurrences', area: 'vida-actual', url: 'https://api.gbif.org/v1/occurrence/search?limit=1', expect: jsonHas('results') },
    { id: 'inaturalist-observations', area: 'vida-actual', url: 'https://api.inaturalist.org/v1/observations?per_page=1', expect: jsonHas('results') },
    { id: 'opentree-about', area: 'taxonomia', url: 'https://api.opentreeoflife.org/v3/tree_of_life/about', method: 'POST', body: '{}', expect: jsonHas('root') },
    { id: 'wikidata-sparql-trivial', area: 'personas', url: 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent('SELECT ?b WHERE { wd:Q254 wdt:P569 ?b }'), expect: jsonHas('results') },
    { id: 'wikidata-sparql-births', area: 'personas', url: 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(wikidataQuery), expect: jsonHas('results') },
    { id: 'wikipedia-onthisday', area: 'efemerides', url: 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/12/05', expect: jsonHas('events') },
    { id: 'commons-api', area: 'imagenes', url: 'https://commons.wikimedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*', expect: jsonHas('query') },
    { id: 'met-open-access-search', area: 'vestimenta', url: 'https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=dress&dateBegin=1750&dateEnd=1800', expect: jsonHas('total') },
    { id: 'openalex-works', area: 'literatura', url: 'https://api.openalex.org/works?per-page=1', expect: jsonHas('results') },
    { id: 'usgs-earthquakes-day', area: 'directo', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', expect: jsonHas('features') },
    { id: 'nasa-eonet-events', area: 'directo', url: 'https://eonet.gsfc.nasa.gov/api/v3/events?limit=1', expect: jsonHas('events') },
    { id: 'jpl-horizons-mars', area: 'astronomia', url: "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='499'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='500@399'&START_TIME='2026-11-01'&STOP_TIME='2026-11-02'&STEP_SIZE='1d'&QUANTITIES='1'", expect: jsonHas('result') },
    { id: 'jsdelivr-historical-basemaps-1945', area: 'fronteras', url: `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${HB_COMMIT}/geojson/world_1945.geojson`, expect: jsonHas('features') },
    { id: 'jsdelivr-historical-basemaps-index', area: 'fronteras', url: `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${HB_COMMIT}/index.json`, expect: jsonHas('years') },
    { id: 'carto-positron-style', area: 'mapa-base', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', expect: jsonHas('layers') },
    { id: 'gplates-coastlines-66ma', area: 'paleogeografia', url: 'https://gws.gplates.org/reconstruct/coastlines/?time=66&model=MERDITH2021', expect: jsonHas('features') },
    { id: 'macrostrat-paleogeography-permian', area: 'paleogeografia-real', url: 'https://macrostrat.org/api/v2/paleogeography?interval_name=Permian', full: true, expect: (t) => t.length > 2 },
    { id: 'macrostrat-paleogeography-250', area: 'paleogeografia-real', url: 'https://macrostrat.org/api/v2/paleogeography?age=250&format=geojson', full: true, expect: (t) => t.length > 2 },
    { id: 'zenodo-paleomap', area: 'paleogeografia-real', url: 'https://zenodo.org/api/records?q=PALEOMAP%20PaleoAtlas&size=5', full: true, expect: jsonHas('hits') },
    { id: 'zenodo-scotese-gplates', area: 'paleogeografia-real', url: 'https://zenodo.org/api/records?q=Scotese%20paleogeography%20GPlates&size=5', full: true, expect: jsonHas('hits') },
    { id: 'zenodo-merdith-model', area: 'paleogeografia-real', url: 'https://zenodo.org/api/records?q=Merdith%20plate%20tectonic%20model%20Neoproterozoic&size=5', full: true, expect: jsonHas('hits') },
    { id: 'zenodo-cao-paleogeography', area: 'paleogeografia-real', url: 'https://zenodo.org/api/records?q=Cao%20Phanerozoic%20palaeogeography%20GPlates&size=5', full: true, expect: jsonHas('hits') },
    { id: 'crossref-merdith2021', area: 'verificacion-doi', url: 'https://api.crossref.org/works/10.1016/j.earscirev.2020.103477', full: true, expect: jsonHas('message') },
    { id: 'crossref-kocsis-scotese', area: 'verificacion-doi', url: 'https://api.crossref.org/works/10.1016/j.earscirev.2020.103463', full: true, expect: jsonHas('message') },
    { id: 'crossref-renne2013', area: 'verificacion-doi', url: 'https://api.crossref.org/works/10.1126/science.1230492', full: true, expect: jsonHas('message') },
    { id: 'zenodo-search-plate-model', area: 'paleogeografia', url: 'https://zenodo.org/api/records?q=Merdith2021%20plate%20model&size=1', expect: jsonHas('hits') },
    // Imagen natural de la Tierra (relieve y color) por teselas: NASA GIBS, WMTS en Web Mercator (el mismo esquema que MapLibre).
    { id: 'gibs-bluemarble-shaded-relief-z2', area: 'tierra-natural', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/2/1/1.jpeg', image: isImage('jpeg'), expect: () => true },
    { id: 'gibs-bluemarble-shaded-relief-z5', area: 'tierra-natural', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/5/11/16.jpeg', image: isImage('jpeg'), expect: () => true },
    { id: 'gibs-bluemarble-shaded-relief-z8', area: 'tierra-natural', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/8/96/128.jpeg', image: isImage('jpeg'), expect: () => true },
    { id: 'gibs-bluemarble-nextgen-z3', area: 'tierra-natural', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/3/2/4.jpeg', image: isImage('jpeg'), expect: () => true },
    { id: 'gibs-wmts-capabilities', area: 'tierra-natural', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml', expect: (t) => /BlueMarble_ShadedRelief_Bathymetry/.test(t) && /GoogleMapsCompatible_Level8/.test(t) },
    { id: 'gibs-bluemarble-layer-detail', area: 'tierra-natural', url: 'https://gibs.earthdata.nasa.gov/layers/BlueMarble_ShadedRelief_Bathymetry.json', expect: (t) => t.length > 2 },
    { id: 'nasa-earthdata-data-policy', area: 'tierra-natural', url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/data-information-policy', expect: (t) => /Earth/i.test(t) }
];

const log = (...args) => console.error(...args);

// Si PROBE_SAMPLES_DIR esta definido, se guarda el cuerpo de cada respuesta
// (completo si t.full, recortado si no) para poder inspeccionar el formato real.
const SAMPLES_DIR = process.env.PROBE_SAMPLES_DIR || '';
const SAMPLE_CHARS = 8000;
const saveSample = (t, text) => {
    if (!SAMPLES_DIR) return;
    const fs = require('fs');
    fs.mkdirSync(SAMPLES_DIR, { recursive: true });
    fs.writeFileSync(`${SAMPLES_DIR}/${t.id}.txt`, t.full ? text : text.slice(0, SAMPLE_CHARS));
};

const probe = async (t) => {
    const started = Date.now();
    const out = { id: t.id, area: t.area, url: t.url.length > 200 ? t.url.slice(0, 200) + '…' : t.url, method: t.method || 'GET' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(t.url, {
            method: t.method || 'GET',
            body: t.body,
            signal: controller.signal,
            headers: {
                'User-Agent': USER_AGENT,
                Origin: ORIGIN,
                Accept: 'application/json, application/geo+json, */*',
                ...(t.body ? { 'Content-Type': 'application/json' } : {})
            }
        });
        const buf = t.image ? Buffer.from(await res.arrayBuffer()) : null;
        const text = t.image ? '' : await res.text();
        if (!t.image) saveSample(t, text);
        const acao = res.headers.get('access-control-allow-origin');
        out.status = res.status;
        out.ok = res.ok;
        out.bytes = t.image ? buf.length : Buffer.byteLength(text);
        out.content_type = res.headers.get('content-type');
        out.cors_allow_origin = acao;
        out.browser_usable = res.ok && (acao === '*' || acao === ORIGIN);
        out.shape_ok = res.ok ? Boolean(t.image ? t.image(buf) : t.expect(text)) : false;
        out.cache_control = res.headers.get('cache-control');
        if (!res.ok || !out.shape_ok) out.snippet = text.slice(0, 300);
    } catch (err) {
        out.ok = false;
        out.browser_usable = false;
        out.shape_ok = false;
        out.error = err.name === 'AbortError' ? `timeout ${TIMEOUT_MS} ms` : `${err.name}: ${err.message}`;
    } finally {
        clearTimeout(timer);
        out.ms = Date.now() - started;
    }
    log(`${out.ok ? 'OK ' : 'XX '} ${t.id.padEnd(40)} status=${out.status ?? '-'} cors=${out.cors_allow_origin ?? '-'} shape=${out.shape_ok} ${out.ms}ms`);
    return out;
};

const main = async () => {
    const results = [];
    // En serie: no queremos que la sonda parezca un ataque a servicios publicos.
    for (const t of targets) {
        results.push(await probe(t));
        await new Promise((r) => setTimeout(r, 500));
    }
    const summary = {
        probed_at: new Date().toISOString(),
        origin: ORIGIN,
        total: results.length,
        reachable: results.filter((r) => r.ok).length,
        browser_usable: results.filter((r) => r.browser_usable && r.shape_ok).length
    };
    process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n');
};

main().catch((err) => {
    log('[ERR] sonda abortada: ' + err.message);
    process.exitCode = 1;
});
