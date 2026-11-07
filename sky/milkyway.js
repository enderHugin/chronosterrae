/* milkyway.js - La Via Lactea como fondo difuso del cielo.
 *
 * Datos: data/textures/milkyway_icrs_4k.jpg (NASA/GSFC SVS 4851, Hipparcos-2, Tycho-2 y Gaia DR2), proyeccion cilindrica equidistante en
 * AR/Dec ICRS/J2000 centrada en AR 0 h, con la AR creciendo hacia la izquierda. Es una IMAGEN DERIVADA DE CATALOGOS, no una fotografia
 * (ver data/textures/manifest.json: tone map y procedencia).
 *
 * Este modulo es puro: dado un mapa pixel -> direccion unitaria J2000, devuelve la imagen de baja resolucion del fondo. Quien lo usa
 * (la vista solar y el cielo tras el globo) aporta ese mapa para su camara. No dibuja estrellas: las del catalogo se pintan encima.
 * Tambien sirve en Node (las pruebas usan texturas sinteticas).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosMilkyWay = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const TAU = 2 * Math.PI;

    /** Textura { w, h, data } (RGBA, Uint8ClampedArray) -> la misma a la mitad de tamano (promedio 2x2, en espacio sRGB como el resto del dibujo). */
    function downsample2(t) {
        const w = t.w >> 1; const h = t.h >> 1; const d = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            for (let c = 0; c < 4; c++) {
                const a = ((2 * y) * t.w + 2 * x) * 4 + c; const b = a + 4; const e = a + t.w * 4; const f = e + 4;
                d[(y * w + x) * 4 + c] = (t.data[a] + t.data[b] + t.data[e] + t.data[f] + 2) >> 2;
            }
        }
        return { w, h, data: d };
    }

    /** Posicion en la textura (u a la derecha, v hacia abajo, ambos 0..1) de una direccion J2000 unitaria. AR 0 h en el centro, AR creciente hacia la izquierda. */
    function uvOf(x, y, z) {
        const ra = Math.atan2(y, x); const dec = Math.asin(z > 1 ? 1 : z < -1 ? -1 : z);
        return [0.5 - ra / TAU, 0.5 - dec / Math.PI];
    }

    /** Muestreo bilineal (con continuidad en el borde de AR 12 h y sujeto en los polos) -> out = [r, g, b] 0..255. */
    function sample(t, x, y, z, out) {
        const uv = uvOf(x, y, z);
        const fx = uv[0] * t.w - 0.5; const fy = uv[1] * t.h - 0.5;
        const x0 = Math.floor(fx); const y0 = Math.floor(fy); const tx = fx - x0; const ty = fy - y0;
        const xa = ((x0 % t.w) + t.w) % t.w; const xb = (xa + 1) % t.w;
        const ya = Math.min(t.h - 1, Math.max(0, y0)); const yb = Math.min(t.h - 1, Math.max(0, y0 + 1));
        const d = t.data;
        for (let c = 0; c < 3; c++) {
            const top = d[(ya * t.w + xa) * 4 + c] * (1 - tx) + d[(ya * t.w + xb) * 4 + c] * tx;
            const bot = d[(yb * t.w + xa) * 4 + c] * (1 - tx) + d[(yb * t.w + xb) * 4 + c] * tx;
            out[c] = top * (1 - ty) + bot * ty;
        }
        return out;
    }

    /**
     * Imagen del fondo.
     * @param o.width, o.height  tamano de la pantalla en pixeles CSS; o.step  lado (px) de cada celda calculada (el resultado es width/step x height/step)
     * @param o.tex              textura { w, h, data }
     * @param o.direction        (px, py, out) -> escribe en out la direccion J2000 unitaria que ve el pixel (px, py) y devuelve true; false si no hay (fuera de la vista)
     * @param o.gain, o.gamma    ganancia y exponente: salida = 255 * (v/255)^gamma * gain (por defecto 1 y 1 = tal cual la textura)
     * @returns { w, h, data }   RGBA; alfa = 255 donde hay vista, 0 donde no
     */
    function render(o) {
        const step = Math.max(1, o.step || 3); const w = Math.ceil(o.width / step); const h = Math.ceil(o.height / step);
        const data = new Uint8ClampedArray(w * h * 4); const dir = [0, 0, 0]; const rgb = [0, 0, 0]; const g = o.gain === undefined ? 1 : o.gain;
        const gamma = o.gamma === undefined ? 1 : o.gamma; const lut = new Float32Array(256); for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(i / 255, gamma) * g;    // curva: el brillo de la textura (pensado para verse) -> cielo oscuro
        const tone = (v) => { const i = Math.max(0, Math.min(254.999, v)); const a = Math.floor(i); return lut[a] + (lut[a + 1] - lut[a]) * (i - a); };
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            if (!o.direction((i + 0.5) * step, (j + 0.5) * step, dir)) continue;
            sample(o.tex, dir[0], dir[1], dir[2], rgb);
            const k = (j * w + i) * 4; data[k] = tone(rgb[0]); data[k + 1] = tone(rgb[1]); data[k + 2] = tone(rgb[2]); data[k + 3] = 255;
        }
        return { w, h, data };
    }

    /** Solo navegador: descarga la imagen y la deja en una textura de ancho targetW (por defecto 1024: 21' por pixel y 2 MB). Reducir la de 4096 a 1024 promedia 4x4 pixeles y
     *  baja el grano de alta frecuencia ~3 veces (medido: 5,3 -> 1,8 niveles de diferencia entre pixeles contiguos a igual brillo relativo) sin perder la banda ni sus nubes oscuras. */
    function load(url, targetW) {
        const tw = targetW || 1024;
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const c = document.createElement('canvas'); c.width = tw; c.height = tw >> 1;
                    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
                    x.drawImage(img, 0, 0, c.width, c.height);
                    const id = x.getImageData(0, 0, c.width, c.height); resolve({ w: id.width, h: id.height, data: id.data });
                } catch (e) { reject(e); }
            };
            img.onerror = () => reject(new Error('no se pudo cargar ' + url));
            img.src = url;
        });
    }

    /* ---- Solo navegador: una unica textura compartida por la vista solar y el cielo tras el globo, y el dibujo sobre un lienzo ---- */
    /** Apariencia por defecto del fondo: la textura se hizo para verse, aqui se lleva a un cielo OSCURO para que las estrellas y las lineas de las constelaciones se lean
     *  (el brillo medio de la banda baja a ~55 % del anterior: gain 0,8 -> 0,45; gamma 2,2 -> 2,3 mantiene el contraste de la banda). */
    const LOOK = { gain: 0.45, gamma: 2.3 };
    const shared = { state: 'idle', tex: null, waiting: [], cache: { key: null, cv: null, w: 0, h: 0 } };
    /**
     * Pide la textura (una sola descarga). cb se llama UNA vez, al pasar a 'ready' (nunca si ya lo estaba: asi se puede llamar en cada fotograma
     * con "vuelve a dibujar" como cb sin provocar un bucle). Devuelve el estado: 'idle'|'loading'|'ready'|'failed'.
     */
    function ensure(url, cb) {
        if (shared.state === 'ready') return 'ready';
        if (cb && shared.waiting.indexOf(cb) < 0) shared.waiting.push(cb);
        if (shared.state === 'idle' && typeof Image !== 'undefined') {
            shared.state = 'loading';
            load(url).then((t) => { shared.tex = t; shared.state = 'ready'; const w = shared.waiting; shared.waiting = []; w.forEach((f) => f()); }).catch(() => { shared.state = 'failed'; shared.waiting = []; });
        }
        return shared.state;
    }
    /**
     * Pinta el fondo sobre ctx (ya con su transformacion a pixeles CSS) sumando luz ('lighter') sobre lo que haya.
     * o = { width, height, direction, key, step, gain, gamma, alpha }: key identifica la vista (si no cambia, se reutiliza la imagen calculada).
     * Devuelve false si la textura aun no esta lista.
     */
    function paint(ctx, o) {
        if (shared.state !== 'ready') return false;
        const step = o.step || 4; const c = shared.cache; const gain = o.gain === undefined ? LOOK.gain : o.gain; const gamma = o.gamma === undefined ? LOOK.gamma : o.gamma;
        const key = o.key + '|' + o.width + 'x' + o.height + '|' + step + '|' + gain + '|' + gamma;
        if (c.key !== key) {
            const img = render({ width: o.width, height: o.height, step, tex: shared.tex, direction: o.direction, gain, gamma });
            if (!c.cv) c.cv = document.createElement('canvas');
            c.cv.width = img.w; c.cv.height = img.h; c.cv.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
            c.key = key; c.w = img.w; c.h = img.h;
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(c.cv, 0, 0, c.w * step, c.h * step); ctx.restore();
        return true;
    }

    /** Estado de la descarga sin provocarla: 'idle'|'loading'|'ready'|'failed'. */
    const state = () => shared.state;

    return { render, sample, uvOf, downsample2, load, ensure, paint, state, LOOK };
});
