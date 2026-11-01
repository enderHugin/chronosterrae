#!/usr/bin/env node
// probe-streetlevel.js - ¿Que fuentes SIN CLAVE permiten ver "a pie de calle" (hoy) o fotos historicas con lugar y fecha?
// No se asume nada: se pide cada API tal como la usaria el navegador (Origin de la web) y se anota CORS, forma y campos.
// Corre en Actions. stdout = JSON; stderr = progreso. Un fallo se registra, no se interpreta.

'use strict';

const ORIGIN = 'https://enderhugin.github.io';
const UA = 'ChronosTerrae-Probe/0.4 (https://github.com/enderHugin/chronosterrae)';
const describe = (e) => e.message + (e.cause ? ' [' + (e.cause.code || e.cause.name || '') + ' ' + (e.cause.message || '') + ']' : '');

async function get(url) {
    const t0 = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA, Origin: ORIGIN, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    return { status: res.status, ok: res.ok, bytes: text.length, ms: Date.now() - t0, acao: res.headers.get('access-control-allow-origin'), type: res.headers.get('content-type'), body: text };
}
const trim = (r, extra) => { const { body, ...meta } = r; return { ...meta, ...extra }; };

async function main() {
    const out = { probed_at: new Date().toISOString(), steps: {} };
    const step = async (name, fn) => { try { out.steps[name] = await fn(); console.error('OK  ', name); } catch (e) { out.steps[name] = { error: describe(e) }; console.error('XX  ', name, describe(e)); } };

    // 1. Wikimedia Commons: fotos con coordenadas cerca de un punto (Madrid, Puerta del Sol y Santiago de Compostela).
    for (const [label, lat, lon] of [['sol-madrid', 40.4168, -3.7038], ['santiago', 42.8806, -8.5446]]) {
        await step('commons-geosearch-' + label, async () => {
            const q = new URLSearchParams({ action: 'query', list: 'geosearch', gscoord: lat + '|' + lon, gsradius: '1000', gslimit: '30', gsnamespace: '6', gsprimary: 'all', format: 'json', origin: '*' });
            const r = await get('https://commons.wikimedia.org/w/api.php?' + q);
            const j = JSON.parse(r.body); const hits = (j.query && j.query.geosearch) || [];
            return trim(r, { count: hits.length, sample: hits.slice(0, 5), keys: Object.keys(j) });
        });
    }
    // 2. Fecha de esas fotos: extmetadata.DateTimeOriginal (texto libre) y licencia.
    await step('commons-imageinfo', async () => {
        const q0 = new URLSearchParams({ action: 'query', list: 'geosearch', gscoord: '40.4168|-3.7038', gsradius: '1000', gslimit: '30', gsnamespace: '6', gsprimary: 'all', format: 'json', origin: '*' });
        const g = JSON.parse((await get('https://commons.wikimedia.org/w/api.php?' + q0)).body).query.geosearch;
        const q = new URLSearchParams({ action: 'query', pageids: g.slice(0, 12).map((x) => x.pageid).join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '320', iiextmetadatafilter: 'DateTimeOriginal|DateTime|LicenseShortName|Artist|ImageDescription', format: 'json', origin: '*' });
        const r = await get('https://commons.wikimedia.org/w/api.php?' + q);
        const pages = Object.values(JSON.parse(r.body).query.pages || {});
        return trim(r, { sample: pages.slice(0, 12).map((p) => ({ title: p.title, thumb: p.imageinfo && p.imageinfo[0].thumburl, date: p.imageinfo && p.imageinfo[0].extmetadata && p.imageinfo[0].extmetadata.DateTimeOriginal && p.imageinfo[0].extmetadata.DateTimeOriginal.value, license: p.imageinfo && p.imageinfo[0].extmetadata && p.imageinfo[0].extmetadata.LicenseShortName && p.imageinfo[0].extmetadata.LicenseShortName.value })) });
    });
    // 3. ¿Se puede cargar la miniatura desde otro origen? (cabeceras de la imagen)
    await step('commons-thumb-headers', async () => {
        const r = await fetch('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/320px-Example.jpg', { headers: { 'User-Agent': UA, Origin: ORIGIN }, signal: AbortSignal.timeout(30000) });
        return { status: r.status, acao: r.headers.get('access-control-allow-origin'), type: r.headers.get('content-type'), timing: r.headers.get('timing-allow-origin') };
    });
    // 4. Wikidata: imagenes historicas de lugares con fecha (P18 + P571/P585) no se prueban aqui; ya hay sonda de Wikidata.

    // 5. Imagen a pie de calle con clave: se prueba SIN clave para saber que responde (no se guarda ni pide ninguna).
    await step('mapillary-sin-clave', async () => {
        const r = await get('https://graph.mapillary.com/images?fields=id&bbox=-3.704,40.416,-3.703,40.417&limit=1');
        return trim(r, { head: r.body.slice(0, 300) });
    });
    // 6. KartaView (antes OpenStreetCam): API abierta; la ruta exacta no se asume, se prueban dos y se anota el resultado.
    for (const [label, url] of [['kartaview-v2', 'https://api.openstreetcam.org/2.0/sequence/?lat=40.4168&lng=-3.7038&limit=3'], ['kartaview-photo', 'https://api.openstreetcam.org/2.0/photo/?lat=40.4168&lng=-3.7038&limit=3']]) {
        await step(label, async () => { const r = await get(url); return trim(r, { head: r.body.slice(0, 400) }); });
    }
    // 7. Wikimedia Commons: categoria de fotos antiguas por lugar (comprobar que se puede filtrar por epoca con CirrusSearch).
    await step('commons-search-historic', async () => {
        const q = new URLSearchParams({ action: 'query', list: 'search', srsearch: 'Puerta del Sol Madrid 1900 filetype:bitmap', srnamespace: '6', srlimit: '8', format: 'json', origin: '*' });
        const r = await get('https://commons.wikimedia.org/w/api.php?' + q);
        const j = JSON.parse(r.body);
        return trim(r, { total: j.query && j.query.searchinfo && j.query.searchinfo.totalhits, sample: ((j.query && j.query.search) || []).map((x) => x.title) });
    });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
main().catch((e) => { console.error('[ERR] ' + describe(e)); process.exitCode = 1; });
