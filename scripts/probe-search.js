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
        await page.keyboard.press('ArrowDown'); await page.waitForTimeout(170);
        const veil = await page.evaluate(() => ({ on: $('era-veil').classList.contains('on'), spot: SPOT.id }));
        await page.screenshot({ path: path.join(out, '2a-velo.png') });
        await page.waitForTimeout(4800);
        const r = await page.evaluate((r0) => ({ veilAfter: $('era-veil').classList.contains('on'), spotAfter: SPOT.id, dimmed: /0\.16/.test(JSON.stringify(map.getPaintProperty('events-icon-bob', 'icon-opacity'))), diskBefore: r0, diskAfter: (earthDisk() || {}).r, center: map.getCenter().toArray(), date: ChronosSky.jdToCalendar(clock.jd, 'auto'), chip: $('ev-hover').hidden ? null : $('ev-hover').textContent, opacity: getComputedStyle(map.getContainer()).opacity }), r0);
        // iconos de personaje que se ven alrededor (claves de dibujo de los sucesos pintados)
        const roles = await page.evaluate(() => { const k = EV_ENTER.sel.map((f) => evDrawKey(f)); return { shown: k.length, withRole: k.filter((x) => x.indexOf('.') > 0).length, sample: [...new Set(k.filter((x) => x.indexOf('.') > 0))].slice(0, 10) }; });
        await page.screenshot({ path: path.join(out, '2-ulm-1879.png') });
        return Object.assign({ veil, roles }, r);
    });
    await step('intro: ficha', async () => {
        await page.keyboard.press('Enter'); await page.waitForTimeout(4000);
        const r = await page.evaluate(() => ({ title: $('info-title').textContent, body: $('info-body').textContent.slice(0, 400) }));
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
    await browser.close();
    fs.writeFileSync(path.join(out, 'search.json'), JSON.stringify(res, null, 1) + '\n');
    console.log(JSON.stringify(res, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
