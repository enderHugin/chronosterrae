#!/usr/bin/env node
// probe-search.js - El buscador en la web REAL publicada (indice generado al publicar, imagenes de Wikimedia Commons de verdad).
//   node scripts/probe-search.js <url> <carpeta-salida>
// 1) «einstein» con las imagenes BLOQUEADAS (se comprueban la lista, el vuelo a Ulm y la fecha, la señal en el icono y la ficha; no hace
//    falta ver la foto de una persona para eso). 2) «notre-dame de paris» con imagenes: miniatura en la lista, imagen en la ficha con autor
//    y licencia leidos de Commons. Escribe capturas y un JSON con lo medido; no toca datos.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const [url, out] = process.argv.slice(2);
(async () => {
    fs.mkdirSync(out, { recursive: true });
    const res = { url, steps: [], errors: [] };
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'es-ES' });
    page.on('pageerror', (e) => res.errors.push(String(e.message || e)));
    // Solo se interceptan las URL de imagenes (miniaturas y Special:FilePath): interceptar tambien la API de Commons hace fallar su CORS
    // en Playwright (comprobado en local: con route('**/*') el fetch falla y sin el funciona), y eso no es lo que ve un usuario.
    const IMG_URL = /^https:\/\/(upload|thumb)\.wikimedia\.org\/|^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//;
    const block = (route) => route.abort();
    await page.route(IMG_URL, block);
    const step = async (name, fn) => { try { const r = await fn(); res.steps.push(Object.assign({ name }, r)); } catch (e) { res.steps.push({ name, error: String(e.message || e) }); } };
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.map && map.loaded && map.loaded() && window.ChronosSearch, null, { timeout: 120000 });
    await page.waitForTimeout(3000);
    await step('lista einstein', async () => {
        await page.click('#search'); const t0 = Date.now(); await page.keyboard.type('einstein', { delay: 60 });
        await page.waitForFunction(() => document.querySelectorAll('#search-list li[role=option]').length > 0, null, { timeout: 60000 });
        const items = await page.evaluate(() => [...document.querySelectorAll('#search-list li[role=option]')].map((li) => li.textContent));
        // orden por defecto (recientes primero) y el icono de personaje de Einstein (matraz de ciencia, no el cochecito)
        const order = await page.evaluate(() => ({ sort: $('search-sort').value, whens: SRCH.items.map((e) => srchWhen(e)) }));
        const role = await page.evaluate(() => { const i = SRCH.items.findIndex((e) => e.qid === 'Q937'); const im = document.querySelector('#sr-' + i + ' img');
            return { loaded: PEOPLE.ver, role: PEOPLE.roles.get('Q937') || null, flask: !!im && im.src === evIconUrl('birth.scientist'), pram: !!im && im.src === evIconUrl('birth') }; });
        await page.screenshot({ path: path.join(out, '1-lista-einstein.png') });
        // para el resto de la sonda, por relevancia: Albert Einstein el primero
        await page.selectOption('#search-sort', 'rel'); await page.waitForTimeout(300); await page.click('#search');
        return { ms: Date.now() - t0, items, order: { sort: order.sort, newestFirst: order.whens.every((x, i) => i === 0 || x <= order.whens[i - 1]) }, role };
    });
    await step('flecha abajo: Ulm, 14-3-1879', async () => {
        const r0 = await page.evaluate(() => (earthDisk() || {}).r);
        // fundido cruzado de epoca: la foto de la escena (no un velo oscuro); se muestrea al aparecer y se mira que el mapa no se oscurece
        await page.evaluate(() => { window.__snap = []; const s = $('era-snap');
            new MutationObserver(() => { let px = null; if (s.style.opacity === '1' && s.width) px = [...s.getContext('2d').getImageData(s.width >> 1, s.height >> 1, 1, 1).data];
                __snap.push({ op: s.style.opacity, fading: s.classList.contains('fading'), px, mapOp: getComputedStyle(map.getContainer()).opacity }); }).observe(s, { attributes: true }); });
        await page.keyboard.press('ArrowDown'); await page.waitForTimeout(170);
        const veil = await page.evaluate(() => ({ noDarkVeil: !document.getElementById('era-veil'), spot: SPOT.id }));
        await page.screenshot({ path: path.join(out, '2a-velo.png') });
        await page.waitForTimeout(4800);
        const r = await page.evaluate((r0) => ({ snap: { log: __snap.slice(0, 6), end: $('era-snap').style.opacity }, spotAfter: SPOT.id, dimmed: /0\.42/.test(JSON.stringify(map.getPaintProperty('events-icon-bob', 'icon-opacity'))), diskBefore: r0, diskAfter: (earthDisk() || {}).r, center: map.getCenter().toArray(), date: ChronosSky.jdToCalendar(clock.jd, 'auto'), chip: $('ev-hover').hidden ? null : $('ev-hover').textContent, opacity: getComputedStyle(map.getContainer()).opacity }), r0);
        // iconos de personaje que se ven alrededor (claves de dibujo de los sucesos pintados)
        const roles = await page.evaluate(() => { const k = EV_ENTER.sel.map((f) => evDrawKey(f)); return { shown: k.length, withRole: k.filter((x) => x.indexOf('.') > 0).length, sample: [...new Set(k.filter((x) => x.indexOf('.') > 0))].slice(0, 10) }; });
        await page.screenshot({ path: path.join(out, '2-ulm-1879.png') });
        return Object.assign({ veil, roles }, r);
    });
    await step('intro: ficha', async () => {
        await page.keyboard.press('Enter'); await page.waitForTimeout(4000);
        // medalla de fiabilidad (map/reliability.js): el simbolo junto al titulo y su fila en la «i» (abierta para la foto)
        const r = await page.evaluate(() => ({ title: $('info-title').textContent, body: $('info-body').textContent.slice(0, 400), medal: $('info-rel').textContent, medalTip: ($('info-rel').firstChild || {}).title || null }));
        await page.evaluate(() => { const b = $('info-more-btn'); if (b && !b.hidden && b.getAttribute('aria-expanded') !== 'true') b.click(); });
        await page.waitForTimeout(600);
        r.reliabilityRow = await page.evaluate(() => ($('info-more').textContent || '').slice(0, 400));
        await page.screenshot({ path: path.join(out, '3-ficha-einstein.png') });
        return r;
    });
    await page.unroute(IMG_URL, block);
    await step('lista notre-dame con imagenes', async () => {
        await page.evaluate(() => map.jumpTo({ zoom: 1.3 }));     // muy lejos: sin icono dibujado, la señal del destino debe ir igual
        await page.fill('#search', ''); await page.click('#search'); await page.keyboard.type('notre-dame de paris', { delay: 40 });
        await page.waitForFunction(() => document.querySelectorAll('#search-list li[role=option]').length > 0, null, { timeout: 60000 });
        await page.keyboard.press('ArrowDown'); await page.waitForTimeout(5000);
        const far = await page.evaluate(() => ({ zoom: map.getZoom(), chip: $('ev-hover').hidden ? null : $('ev-hover').textContent }));
        const pics = await page.evaluate(() => [...document.querySelectorAll('#search-list .sr-pic')].map((im) => ({ ok: im.complete && im.naturalWidth > 0, w: im.naturalWidth })));
        await page.screenshot({ path: path.join(out, '4-lista-notredame.png') });
        return { pics, far };
    });
    await step('intro: ficha con imagen y licencia', async () => {
        await page.keyboard.press('Enter'); await page.waitForTimeout(7000);
        const r = await page.evaluate(() => { const im = document.querySelector('#info figure.info-pic img'); const cap = document.querySelector('#info figure.info-pic figcaption');
            return { title: $('info-title').textContent, img: im ? { ok: im.complete && im.naturalWidth > 0, w: im.naturalWidth } : null, caption: cap ? cap.textContent : null, links: cap ? [...cap.querySelectorAll('a')].map((a) => a.href) : [] }; });
        await page.screenshot({ path: path.join(out, '5-ficha-notredame.png') });
        return r;
    });
    // Tactil (iPad emulado en Chromium; no es Safari de verdad): 1er toque = ver (gira y cambia la fecha), 2º toque = abrir. El creador vio en
    // su iPad que tocar un resultado no movia la Tierra (2026-11-12).
    await step('tactil (iPad): toque ver, toque abrir', async () => {
        const { devices } = require('playwright');
        const ctx = await browser.newContext(Object.assign({}, devices['iPad Pro 11'], { locale: 'es-ES' }));
        const tp = await ctx.newPage(); tp.on('pageerror', (e) => res.errors.push('tactil: ' + String(e.message || e)));
        await tp.route(IMG_URL, block);
        await tp.goto(url, { waitUntil: 'load', timeout: 120000 });
        await tp.waitForFunction(() => window.map && map.loaded && map.loaded() && window.ChronosSearch, null, { timeout: 120000 }); await tp.waitForTimeout(3000);
        await tp.tap('#search'); await tp.keyboard.type('einstein', { delay: 50 });
        await tp.waitForFunction(() => SRCH.items.length > 0, null, { timeout: 60000 });
        await tp.selectOption('#search-sort', 'rel'); await tp.waitForTimeout(400);
        if (!(await tp.evaluate(() => SRCH.items.length))) { await tp.tap('#search'); await tp.waitForTimeout(800); }
        const hint = await tp.evaluate(() => (document.querySelector('#search-list .sr-msg') || {}).textContent);
        await tp.tap('#sr-0'); await tp.waitForTimeout(7000);
        const first = await tp.evaluate(() => ({ center: map.getCenter().toArray(), year: ybpToYear(state.ybp), list: SRCH.items.length, info: $('info').style.display, spot: SPOT.id }));
        await tp.screenshot({ path: path.join(out, '6-tactil-ver.png') });
        await tp.tap('#sr-0'); await tp.waitForTimeout(5000);
        const second = await tp.evaluate(() => ({ center: map.getCenter().toArray(), info: $('info').style.display, title: $('info-title').textContent, list: SRCH.items.length }));
        await tp.screenshot({ path: path.join(out, '7-tactil-abrir.png') });
        await ctx.close();
        return { hint, first, second };
    });
    // Busqueda en directo en Wikidata (personas fuera de nuestro indice): «jaime» -> Jaime I de Aragon (Q212052), con la API de verdad
    await step('wikidata en directo: jaime', async () => {
        await page.evaluate(() => { map.jumpTo({ center: [15, 12] }); });
        await page.fill('#search', ''); await page.click('#search'); await page.keyboard.type('jaime i de aragon', { delay: 50 });
        await page.waitForFunction(() => SRCH.items.some((e) => e.kind === 'wd') || (WD.err && !WD.loading), null, { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(2500);
        const list = await page.evaluate(() => ({ err: WD.err, items: SRCH.items.filter((e) => e.kind === 'wd').map((e) => [e.qid, e.es || e.en, e.desc]) }));
        await page.screenshot({ path: path.join(out, '10-wd-lista.png') });
        const i = await page.evaluate(() => SRCH.items.findIndex((e) => e.qid === 'Q212052'));
        if (i < 0) return { list };
        await page.click('#sr-' + i); await page.waitForTimeout(9000);
        const r = await page.evaluate(() => ({ center: map.getCenter().toArray(), date: ChronosSky.jdToCalendar(clock.jd, 'auto'), title: $('info-title').textContent, rows: [...document.querySelectorAll('#info-body .row')].map((x) => x.textContent).slice(0, 8), pick: SPOTPICK.f && SPOTPICK.f.properties.id }));
        await page.screenshot({ path: path.join(out, '11-wd-jaime.png') });
        return { list, r };
    });
    // Movil (iPhone emulado en Chromium): construccion elegida de lejos DIBUJADA (capa spot-pick) con su etiqueta en pantalla y sin taparla;
    // con muchos resultados la lista termina por encima del destino (el creador, 2026-11-12: iconos de construcciones que no se veian).
    await step('movil: destino dibujado y visible', async () => {
        const { devices } = require('playwright');
        const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13'], { locale: 'es-ES' }));
        const tp = await ctx.newPage(); tp.on('pageerror', (e) => res.errors.push('movil: ' + String(e.message || e)));
        await tp.route(IMG_URL, block);
        await tp.goto(url, { waitUntil: 'load', timeout: 120000 });
        await tp.waitForFunction(() => window.map && map.loaded && map.loaded() && window.ChronosSearch, null, { timeout: 120000 }); await tp.waitForTimeout(3000);
        await tp.tap('#search'); await tp.keyboard.type('notre-dame de paris', { delay: 50 });
        await tp.waitForFunction(() => SRCH.items.length > 0, null, { timeout: 60000 });
        await tp.tap('#sr-0'); await tp.waitForTimeout(7000);
        const nd = await tp.evaluate(() => { const e = SRCH.items[0]; const p = map.project([e.lng, e.lat]); const c = $('ev-hover').getBoundingClientRect();
            return { zoom: map.getZoom(), pick: map.queryRenderedFeatures([p.x, p.y], { layers: ['spot-pick'] }).map((f) => f.properties.id), chip: $('ev-hover').hidden ? null : [c.left | 0, c.right | 0, c.top | 0, c.bottom | 0], p: [p.x | 0, p.y | 0], W: innerWidth }; });
        await tp.screenshot({ path: path.join(out, '8-movil-notredame.png') });
        await tp.tap('#search'); await tp.fill('#search', ''); await tp.keyboard.type('einstein', { delay: 50 });
        await tp.waitForFunction(() => SRCH.items.length >= 4, null, { timeout: 60000 }); await tp.waitForTimeout(400);
        const list = await tp.evaluate(() => { const r = $('search-list').getBoundingClientRect(); return { bottom: r.bottom | 0, cy: innerHeight / 2 | 0 }; });
        const i = await tp.evaluate(() => SRCH.items.findIndex((e) => e.qid === 'Q937'));
        await tp.evaluate((i) => $('sr-' + i).scrollIntoView({ block: 'nearest' }), i); await tp.tap('#sr-' + i); await tp.waitForTimeout(7000);
        const ein = await tp.evaluate(() => { const e = SRCH.items.find((x) => x.qid === 'Q937'); const p = map.project([e.lng, e.lat]); const t = document.elementFromPoint(p.x, p.y);
            return { p: [p.x | 0, p.y | 0], listBottom: $('search-list').getBoundingClientRect().bottom | 0, pick: map.queryRenderedFeatures([p.x, p.y], { layers: ['spot-pick'] }).map((f) => f.properties.id), onTop: t && (t.id || t.tagName) }; });
        await tp.screenshot({ path: path.join(out, '9-movil-einstein.png') });
        await ctx.close();
        return { notredame: nd, list, einstein: ein };
    });
    await browser.close();
    fs.writeFileSync(path.join(out, 'search.json'), JSON.stringify(res, null, 1) + '\n');
    console.log(JSON.stringify(res, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
