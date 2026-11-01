/* timed.js - Que mostrar y de que avisar, segun el instante y la escala (sin DOM; igual en navegador y en Node).
 *
 * Los sucesos (nacimientos, muertes, obras, descubrimientos, hechos) son registros ChronosTerrae con fecha y a veces hora.
 * Para no saturar el mapa la decision es doble:
 *   - TIEMPO: solo los que ocurren cerca del instante del reloj (ventana de ±medio año por defecto);
 *   - ESCALA: cuanto mas lejos esta la camara, mas notorio debe ser un suceso para dibujarse (importance), y de los que
 *     caben se deja uno por celda de pantalla.
 * Los avisos salen del recorrido continuo del reloj: nunca se dispara una cascada al saltar de siglo con la barra.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosTimed = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const JD_1950 = 2433282.5;
    const DAY = 86400;
    const LEADS_S = [300, 60, 10];                 // avisos previos de los sucesos con hora
    const TIMED = new Set(['second', 'minute', 'hour']);

    const isTimed = (f) => TIMED.has(f.properties.time.precision);

    /** Tramo de tiempo del suceso en dia juliano UT: [a, b]. Los de hora son un instante; los de dia, ese dia UT. */
    function span(f) {
        const t = f.properties.time;
        if (t.instant) return { a: t.instant.jd_ut, b: t.instant.jd_ut, timed: true };
        const a = JD_1950 - t.start_ybp * 365.25; const b = JD_1950 - t.end_ybp * 365.25;
        if (t.precision === 'day') return { a, b: a + 1, timed: false };
        return { a: Math.min(a, b), b: Math.max(a, b), timed: false };
    }

    /** Importancia minima para dibujar un suceso cuando la camara abarca viewMeters de ancho. */
    function importanceFloor(viewMeters) {
        if (viewMeters >= 6e6) return 0.88;
        if (viewMeters >= 2.5e6) return 0.78;
        if (viewMeters >= 1e6) return 0.68;
        if (viewMeters >= 4e5) return 0.58;
        if (viewMeters >= 1.5e5) return 0.48;
        if (viewMeters >= 5e4) return 0.35;
        return 0;
    }

    /**
     * @param feats  registros de sucesos
     * @param o  { jd, halfWindowDays, viewMeters, bounds:[w,s,e,n]|null, max, cellPx, project:(lng,lat)=>[x,y] }
     * @returns registros a dibujar, los mas notorios primero
     */
    function selectVisible(feats, o) {
        const half = o.halfWindowDays === undefined ? 183 : o.halfWindowDays;
        const floor = importanceFloor(o.viewMeters);
        const max = o.max || 60; const cell = o.cellPx || 48;
        const lo = o.jd - half; const hi = o.jd + half;
        const cand = [];
        for (const f of feats) {
            if (!f.geometry || f.geometry.type !== 'Point') continue;
            const p = f.properties;
            if (p.importance < floor) continue;
            const sp = span(f);
            if (sp.b < lo || sp.a > hi) continue;
            const [lng, lat] = f.geometry.coordinates;
            if (o.bounds) {
                const [w, s, e, n] = o.bounds;
                if (lat < s || lat > n) continue;
                if (w <= e ? (lng < w || lng > e) : (lng < w && lng > e)) continue;
            }
            cand.push(f);
        }
        cand.sort((a, b) => b.properties.importance - a.properties.importance || a.properties.id.localeCompare(b.properties.id));
        const taken = new Set(); const out = [];
        for (const f of cand) {
            if (out.length >= max) break;
            if (o.project) {
                const [x, y] = o.project(f.geometry.coordinates[0], f.geometry.coordinates[1]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                const key = Math.floor(x / cell) + ',' + Math.floor(y / cell);
                if (taken.has(key)) continue;
                taken.add(key);
            }
            out.push(f);
        }
        return out;
    }

    /**
     * Avisos al pasar el reloj de prevJD a jd.
     * @returns [{ feature, phase: 'lead'|'now'|'day'|'jump', leadS, eventJD }]
     *   lead = faltan leadS segundos (solo con hora); now = ocurre ahora; day = entra el dia (solo con fecha); jump = salto del reloj
     *   que aterriza cerca de un suceso con hora.
     */
    function notices(feats, prevJD, jd, o) {
        const opt = o || {};
        const out = [];
        if (!(jd > prevJD)) return out;                                 // solo hacia adelante
        const stepS = (jd - prevJD) * DAY;
        const continuous = stepS <= (opt.maxStepS || 7200);
        const minImportance = opt.minImportance === undefined ? 0 : opt.minImportance;
        for (const f of feats) {
            const sp = span(f);
            const imp = f.properties.importance;
            if (sp.timed) {
                const ev = sp.a;
                if (continuous) {
                    for (const lead of LEADS_S) { const at = ev - lead / DAY; if (prevJD < at && at <= jd) out.push({ feature: f, phase: 'lead', leadS: lead, eventJD: ev }); }
                    if (prevJD < ev && ev <= jd) out.push({ feature: f, phase: 'now', leadS: 0, eventJD: ev });
                } else if (ev - jd <= 600 / DAY && ev - jd > -60 / DAY) {
                    out.push({ feature: f, phase: 'jump', leadS: Math.round((ev - jd) * DAY), eventJD: ev });
                }
            } else if (continuous && imp >= minImportance && prevJD < sp.a && sp.a <= jd && f.properties.time.precision === 'day') {
                out.push({ feature: f, phase: 'day', leadS: 0, eventJD: sp.a });
            }
        }
        return out;
    }

    function formatCountdown(seconds, lang) {
        const s = Math.max(0, Math.round(seconds));
        const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
        const u = lang === 'es' ? { h: 'h', m: 'min', s: 's' } : { h: 'h', m: 'min', s: 's' };
        if (h > 0) return h + ' ' + u.h + ' ' + String(m).padStart(2, '0') + ' ' + u.m;
        if (m > 0) return m + ' ' + u.m + ' ' + String(r).padStart(2, '0') + ' ' + u.s;
        return r + ' ' + u.s;
    }

    /** Claves de los ficheros por siglo (c<N>; el siglo 0 son los años 1-99) que cubren [year0, year1]. */
    // Un suceso masivo (solo fecha) que es el MISMO que uno de la semilla con hora verificada se descarta:
    // misma fecha (la del masivo puede ser mas gruesa: año o mes) y alguna palabra significativa en comun.
    function dedupeAgainst(timed, others) {
        const words = (s) => new Set(String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 5));
        const twins = timed.map((f) => ({ iso: f.properties.time.iso || '', words: words(f.properties.name) }));
        return others.filter((o) => {
            const iso = o.properties.time.iso || '';
            if (!iso) return true;
            const w = words(o.properties.name);
            return !twins.some((t) => t.iso.startsWith(iso) && [...w].some((x) => t.words.has(x)));
        });
    }

    function shardKeys(year0, year1) {
        const keys = [];
        for (let c = Math.floor(Math.max(1, year0) / 100); c <= Math.floor(year1 / 100); c++) keys.push('c' + c);
        return keys;
    }

    return { span, isTimed, importanceFloor, selectVisible, notices, formatCountdown, shardKeys, dedupeAgainst, LEADS_S };
});
