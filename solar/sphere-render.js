/* sphere-render.js - Dibuja un cuerpo del sistema solar como ELIPSOIDE de revolucion con textura, iluminado por el Sol, y (si lo tiene)
 * su sistema de anillos con perfil de opacidad medido. Sin DOM: se prueba en Node (scripts/check-sphere-render.js) y la pantalla solo
 * pone el resultado en un canvas.
 *
 * Que es calculo y que es dato:
 *  - Geometria: proyeccion ortografica (cuerpo lejano frente a su tamano), interseccion exacta rayo-elipsoide, normal del elipsoide, longitud
 *    y latitud PLANETOCENTRICAS del punto (las de las etiquetas PDS de las texturas). La orientacion (ejes del cuerpo) y el radio ecuatorial/polar
 *    vienen de sky/planets.js (IAU, validado contra Horizons); aqui solo se usan.
 *  - Iluminacion: modelos, no mediciones. 'lambert' (atmosferas y nubes) o 'lommel' (Lommel-Seeliger, cuerpos de regolito/hielo sin atmosfera:
 *    el disco lleno es casi uniforme, como la Luna llena). El lado nocturno recibe una luz minima fija (no se modela luz terrestre).
 *  - Anillos: la opacidad (profundidad optica normal) es el perfil medido por Cassini UVIS (data/textures/saturn-rings-tau.json). El COLOR del
 *    anillo y el albedo de dispersion son ilustrativos. Se aplican transmision exp(-tau/mu), dispersion simple de una capa plana (reflexion en
 *    el lado iluminado, transmision en el opuesto), sombra del planeta sobre el anillo y del anillo sobre el planeta.
 *
 * Convencion de ejes. Camara: x derecha, y arriba, z hacia el observador. Cuerpo: x = meridiano origen en el ecuador, z = polo norte,
 * y = z x x (este). axes = { x, y, z }: cada uno es el eje del cuerpo expresado en la base de la camara.
 * Texturas: columna j de W -> longitud ESTE = 360 (j + 1/2) / W - 180; fila i de H -> latitud = 90 - 180 (i + 1/2) / H (data/textures/README.md).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosSphereRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TAU2PI = 2 * Math.PI;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    /** Niveles de reduccion a la mitad (promedio 2x2) para no hacer aliasing cuando el disco es pequeno frente a la textura. */
    function makeMips(tex) {
        const levels = [tex];
        let cur = tex;
        while (cur.w >= 64 && cur.h >= 32) {
            const w = cur.w >> 1; const h = cur.h >> 1; const d = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
                const i0 = ((2 * y) * cur.w + 2 * x) * 4 + c; const i1 = i0 + 4; const i2 = i0 + cur.w * 4; const i3 = i2 + 4;
                d[(y * w + x) * 4 + c] = (cur.data[i0] + cur.data[i1] + cur.data[i2] + cur.data[i3] + 2) >> 2;
            }
            cur = { w, h, data: d }; levels.push(cur);
        }
        return levels;
    }

    /** Muestra bilineal (envuelve en longitud, se fija en latitud). u, v en [0,1]; escribe en out[0..2] en 0-255. */
    function sample(tex, u, v, out) {
        const fx = u * tex.w - 0.5; const fy = v * tex.h - 0.5;
        const x0 = Math.floor(fx); const y0 = Math.floor(fy); const tx = fx - x0; const ty = fy - y0;
        const xa = ((x0 % tex.w) + tex.w) % tex.w; const xb = (xa + 1) % tex.w;
        const ya = y0 < 0 ? 0 : y0 >= tex.h ? tex.h - 1 : y0; const yb = y0 + 1 < 0 ? 0 : y0 + 1 >= tex.h ? tex.h - 1 : y0 + 1;
        const d = tex.data;
        const i00 = (ya * tex.w + xa) * 4; const i10 = (ya * tex.w + xb) * 4; const i01 = (yb * tex.w + xa) * 4; const i11 = (yb * tex.w + xb) * 4;
        const w00 = (1 - tx) * (1 - ty); const w10 = tx * (1 - ty); const w01 = (1 - tx) * ty; const w11 = tx * ty;
        for (let c = 0; c < 3; c++) out[c] = d[i00 + c] * w00 + d[i10 + c] * w10 + d[i01 + c] * w01 + d[i11 + c] * w11;
    }

    /** Profundidad optica normal a radio r (km): interpolacion lineal del perfil; 0 fuera del intervalo con datos o donde no hay dato. */
    function ringTau(ring, rKm) {
        const p = ring.profile; const f = (rKm - p.r0Km) / p.stepKm - 0.5;
        const i0 = Math.floor(f); const t = f - i0;
        const a = i0 >= 0 && i0 < p.n ? p.tau[i0] : null; const b = i0 + 1 >= 0 && i0 + 1 < p.n ? p.tau[i0 + 1] : null;
        if (a === null && b === null) return 0;
        if (a === null) return t > 0.5 ? b : 0;                                // un hueco sin dato (null) no se rellena: se toma el vecino con dato solo del lado mas cercano
        if (b === null) return t < 0.5 ? a : 0;
        return a * (1 - t) + b * t;
    }

    /** Raiz menor t>=0-ish de |O + tD|^2 = 1 en el elipsoide (1,1,f) (O y D ya en unidades del radio ecuatorial); null si no corta. */
    function hitEllipsoid(ox, oy, oz, dx, dy, dz, f) {
        const oz2 = oz / f; const dz2 = dz / f;
        const A = dx * dx + dy * dy + dz2 * dz2; const B = ox * dx + oy * dy + oz2 * dz2; const C = ox * ox + oy * oy + oz2 * oz2 - 1;
        const disc = B * B - A * C;
        if (disc < 0 || A === 0) return null;
        return (-B - Math.sqrt(disc)) / A;
    }

    /**
     * Calcula la imagen RGBA (no premultiplicada) del cuerpo.
     * o = { pr, axes: {x,y,z}, light: [x,y,z] (hacia el Sol, base de la camara, unitario), flat: c/a, tex?: levels[] (makeMips) | color: [r,g,b] 0-255,
     *       law: 'lambert'|'lommel', night: luz minima (0-1), ring?: { inKm, outKm, aKm, profile, color: [r,g,b], albedo } }
     * pr = radio ecuatorial en pixeles. Devuelve { size, data, half } con el centro del cuerpo en (size/2, size/2).
     */
    function render(o) {
        const f = o.flat > 0 && o.flat <= 1 ? o.flat : 1; const night = o.night === undefined ? 0.03 : o.night; const ring = o.ring || null;
        const ext = ring ? Math.max(1, ring.outKm / ring.aKm) : 1;
        const half = Math.ceil(ext * o.pr) + 2; const S = 2 * half;
        const out = new Uint8ClampedArray(S * S * 4);
        const ex = o.axes.x; const ey = o.axes.y; const ez = o.axes.z; const L = o.light;
        const Lb = [L[0] * ex[0] + L[1] * ex[1] + L[2] * ex[2], L[0] * ey[0] + L[1] * ey[1] + L[2] * ey[2], L[0] * ez[0] + L[1] * ez[1] + L[2] * ez[2]];
        const Dp = [-ex[2], -ey[2], -ez[2]];                                  // direccion del rayo en el cuerpo (de la camara hacia el cuerpo)
        const lommel = o.law === 'lommel';
        let level = null; let color = o.color || [160, 160, 160];
        if (o.tex) {
            const want = Math.max(0, Math.floor(Math.log2(Math.max(1, o.tex[0].w / (TAU2PI * Math.max(o.pr, 1))))));
            level = o.tex[Math.min(want, o.tex.length - 1)];
        }
        const rgb = [0, 0, 0];
        const ringSunSide = Math.sign(Lb[2]) || 1; const ringObsSide = Math.sign(-Dp[2]) || 1;
        for (let j = 0; j < S; j++) {
            const Y = -(j + 0.5 - half) / o.pr;
            for (let i = 0; i < S; i++) {
                const X = (i + 0.5 - half) / o.pr;
                const Ox = X * ex[0] + Y * ex[1]; const Oy = X * ey[0] + Y * ey[1]; const Oz = X * ez[0] + Y * ez[1];
                const tp = hitEllipsoid(Ox, Oy, Oz, Dp[0], Dp[1], Dp[2], f);
                let pr_ = 0; let pg = 0; let pb = 0; let planet = false;
                if (tp !== null) {
                    planet = true;
                    const px = Ox + tp * Dp[0]; const py = Oy + tp * Dp[1]; const pz = Oz + tp * Dp[2];
                    let nx = px; let ny = py; let nz = pz / (f * f); const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
                    const ncx = nx * ex[0] + ny * ey[0] + nz * ez[0]; const ncy = nx * ex[1] + ny * ey[1] + nz * ez[1]; const ncz = nx * ex[2] + ny * ey[2] + nz * ez[2];
                    const mu0 = ncx * L[0] + ncy * L[1] + ncz * L[2]; const mu = Math.max(ncz, 1e-4);
                    let lit = 0;
                    if (mu0 > 0) lit = lommel ? 2 * mu0 / (mu0 + mu) : mu0;
                    if (lit > 0 && ring && Math.abs(Lb[2]) > 1e-9) {                    // sombra del anillo sobre el planeta
                        const s = -pz / Lb[2];
                        if (s > 0) { const rr = Math.hypot(px + s * Lb[0], py + s * Lb[1]) * ring.aKm; if (rr >= ring.inKm && rr <= ring.outKm) lit *= Math.exp(-ringTau(ring, rr) / Math.abs(Lb[2])); }
                    }
                    if (level) {
                        const lon = Math.atan2(py, px); const lat = Math.atan2(pz, Math.hypot(px, py));
                        sample(level, (lon + Math.PI) / TAU2PI, (Math.PI / 2 - lat) / Math.PI, rgb);
                    } else { rgb[0] = color[0]; rgb[1] = color[1]; rgb[2] = color[2]; }
                    const k = night + (1 - night) * lit;
                    pr_ = rgb[0] * k; pg = rgb[1] * k; pb = rgb[2] * k;
                }
                let ar = 0; let ag = 0; let ab = 0; let alpha = planet ? 1 : 0;
                if (ring && Math.abs(Dp[2]) > 1e-6) {
                    const tr = -Oz / Dp[2];
                    const qx = Ox + tr * Dp[0]; const qy = Oy + tr * Dp[1];
                    const rr = Math.hypot(qx, qy) * ring.aKm;
                    if (rr >= ring.inKm && rr <= ring.outKm && (tp === null || tr < tp)) {
                        const tau = ringTau(ring, rr);
                        const mu = Math.abs(Dp[2]); const mu0 = Math.max(Math.abs(Lb[2]), 1e-6);
                        const T = Math.exp(-tau / mu);
                        const ts = hitEllipsoid(qx, qy, 0, Lb[0], Lb[1], Lb[2], f);          // el punto del anillo esta fuera del planeta: corta hacia el Sol si la raiz menor es positiva
                        const shadow = ts !== null && ts > 0;
                        let I = 0;
                        if (!shadow) {
                            if (ringSunSide === ringObsSide) I = (mu0 / (mu + mu0)) * (1 - Math.exp(-tau * (1 / mu + 1 / mu0)));
                            else if (Math.abs(mu - mu0) < 1e-3) I = 0.5 * (tau / mu) * Math.exp(-tau / mu);
                            else I = 0.5 * (mu0 / (mu0 - mu)) * (Math.exp(-tau / mu0) - Math.exp(-tau / mu));
                            I *= ring.albedo === undefined ? 1 : ring.albedo;
                        }
                        const c = ring.color; const lightK = night * 0.5 + (1 - night * 0.5) * 1;
                        ar = c[0] * I * lightK; ag = c[1] * I * lightK; ab = c[2] * I * lightK;
                        const a = planet ? 1 : 1 - T;
                        if (planet) { pr_ = ar + T * pr_; pg = ag + T * pg; pb = ab + T * pb; alpha = 1; }
                        else { alpha = a; if (a > 1e-4) { pr_ = ar / a; pg = ag / a; pb = ab / a; } }
                    }
                }
                const o4 = (j * S + i) * 4;
                out[o4] = pr_; out[o4 + 1] = pg; out[o4 + 2] = pb; out[o4 + 3] = clamp01(alpha) * 255;
            }
        }
        return { size: S, half, data: out };
    }

    return { render, makeMips, sample, ringTau, hitEllipsoid };
});
