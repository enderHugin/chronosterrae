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
     *   Ventana por velocidad (ver windowFor): pastDays / futureDays en vez de halfWindowDays; con ella el umbral de notoriedad sube
     *   cuanto mas larga es («solo significativos»). `meta` (un Map) recibe por suceso { frac, alpha } (antiguedad relativa y su nivel de desvanecido).
     * @returns registros a dibujar, los mas notorios primero
     */
    function selectVisible(feats, o) {
        const half = o.halfWindowDays === undefined ? BASE_HALF_DAYS : o.halfWindowDays;
        const flowing = o.pastDays !== undefined || o.futureDays !== undefined;
        const past = o.pastDays !== undefined ? o.pastDays : half; const future = o.futureDays !== undefined ? o.futureDays : half;
        const floor = Math.max(importanceFloor(o.viewMeters), flowing ? windowImportance(Math.max(past, future)) : 0);
        const max = o.max || 60; const cell = o.cellPx || 48;
        const lo = o.jd - past; const hi = o.jd + future;
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
            if (o.meta) { const fr = ageFraction(f, o.jd, past, future); o.meta.set(f, { frac: fr, alpha: fadeAlpha(fr) }); }
        }
        return out;
    }

    /* ---------------------------- Ventana segun la velocidad del tiempo ---------------------------- */
    // Un suceso no se ve «en su dia y hora» (con el tiempo pasando deprisa no se veria ninguno): se ve mientras dura la ventana, que crece con la
    // velocidad a la que fluye el tiempo. Con tiempo lento o parado vale el minimo de siempre (±6 meses, simetrico).
    const BASE_HALF_DAYS = 183;
    const HOLD_S = 6;                       // segundos REALES que un suceso permanece en pantalla mientras el tiempo fluye
    const MAX_PAST_DAYS = 36525;            // tope: 100 años
    const AHEAD_MIN_DAYS = 30;
    const MAX_RATE = 3.2e9;                 // tope de la velocidad medida (s simulados por s reales): ~100 años/s

    /** Importancia minima segun lo larga que sea la ventana (dias): cuanto mas tiempo se muestra a la vez, solo lo mas significativo. */
    function windowImportance(days) {
        if (days <= 400) return 0;
        if (days <= 3700) return 0.45;
        if (days <= 11000) return 0.62;
        return 0.78;
    }

    /**
     * Ventana de visibilidad para una velocidad con signo (segundos simulados por segundo real; negativa = hacia atras).
     * @returns { pastDays, futureDays, flowing } dias hacia el pasado y hacia el futuro de la fecha del reloj. Con el tiempo fluyendo deprisa
     *   la ventana larga queda DETRAS (de donde viene el tiempo) y por delante solo un margen corto, para que los sucesos aparezcan al llegar.
     */
    function windowFor(rate) {
        const r = Number.isFinite(rate) ? Math.max(-MAX_RATE, Math.min(MAX_RATE, rate)) : 0;
        const behind = Math.min(MAX_PAST_DAYS, Math.abs(r) * HOLD_S / 86400);
        if (behind <= BASE_HALF_DAYS) return { pastDays: BASE_HALF_DAYS, futureDays: BASE_HALF_DAYS, flowing: false };
        const ahead = Math.max(AHEAD_MIN_DAYS, behind / 8);
        return r >= 0 ? { pastDays: behind, futureDays: ahead, flowing: true } : { pastDays: ahead, futureDays: behind, flowing: true };
    }

    // Salto del reloj ANIMADO (map/glide.js): el reloj barre de una fecha a otra y los sucesos del tramo se ven pasar. Cada suceso se queda visible
    // una fraccion del tramo (no un tiempo fijo): asi vale igual para 10 dias que para 100 años y siempre queda dentro del rango recorrido.
    const GLIDE_HOLD = 0.4;           // el suceso permanece visible durante el 40 % del tramo (parametro editorial)
    const GLIDE_MIN_DAYS = 7;         // por debajo no hay «recorrido»: vale la ventana normal
    /** Ventana durante un barrido de spanDays dias en el sentido dir (+1 adelante, -1 atras). */
    function windowForGlide(spanDays, dir) {
        const S = Math.abs(Number.isFinite(spanDays) ? spanDays : 0);
        if (S < GLIDE_MIN_DAYS) return { pastDays: BASE_HALF_DAYS, futureDays: BASE_HALF_DAYS, flowing: false };
        const behind = GLIDE_HOLD * S; const ahead = Math.max(1, behind / 8);
        return dir >= 0 ? { pastDays: behind, futureDays: ahead, flowing: true } : { pastDays: ahead, futureDays: behind, flowing: true };
    }
    /** Va cerrando una ventana larga hasta la normal (f = 1 entera, f = 0 normal): al acabar el barrido los sucesos mas antiguos se van primero. */
    function shrinkWindow(win, f) {
        const x = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0));
        if (!win || !win.flowing || x === 0) return { pastDays: BASE_HALF_DAYS, futureDays: BASE_HALF_DAYS, flowing: false };
        const mix = (v) => BASE_HALF_DAYS + (v - BASE_HALF_DAYS) * x;
        return { pastDays: mix(win.pastDays), futureDays: mix(win.futureDays), flowing: true };
    }

    /** Distancia relativa (0 = ahora, 1 = borde de la ventana) del suceso a la fecha jd; 0 si jd cae dentro de su tramo. */
    function ageFraction(f, jd, pastDays, futureDays) {
        const sp = span(f);
        if (jd >= sp.a && jd <= sp.b) return 0;
        if (jd > sp.b) return Math.min(1, (jd - sp.b) / Math.max(1e-9, pastDays));
        return Math.min(1, (sp.a - jd) / Math.max(1e-9, futureDays));
    }

    // Niveles de desvanecido: [hasta esta fraccion, opacidad]. Cuatro escalones, no una rampa continua: se leen y no obligan a redibujar cada fotograma.
    const FADE_LEVELS = [[0.15, 1], [0.4, 0.8], [0.7, 0.55], [Infinity, 0.32]];
    function fadeAlpha(frac) {
        const x = Number.isFinite(frac) ? Math.max(0, frac) : 1;
        for (const [upTo, a] of FADE_LEVELS) if (x <= upTo) return a;
        return FADE_LEVELS[FADE_LEVELS.length - 1][1];
    }

    /**
     * Mide con que velocidad fluye el tiempo (segundos simulados por segundo real, con signo) a partir de los instantes que va tomando el reloj:
     * sirve igual para el reloj acelerado que para arrastrar el deslizador. Solo cuenta el movimiento CONTINUO (notas separadas por menos de
     * gapMs): un salto aislado (un boton de epoca) no es «tiempo que fluye». La medida sube rapido y baja despacio al parar.
     */
    function createMotion(o) {
        const gapMs = (o && o.gapMs) || 400; const attackS = (o && o.attackS) || 0.4; const releaseS = (o && o.releaseS) || 2.5;
        let last = null; let v = 0; let vT = 0;
        const decayed = (nowMs) => { const idle = (nowMs - vT) / 1000; return idle <= gapMs / 1000 ? v : v * Math.pow(0.5, (idle - gapMs / 1000) / releaseS); };
        return {
            note(jd, nowMs) {
                if (!Number.isFinite(jd) || !Number.isFinite(nowMs)) return;
                if (last && nowMs > last.t && nowMs - last.t <= gapMs) {
                    const dt = (nowMs - last.t) / 1000; const inst = (jd - last.jd) * 86400 / dt;
                    const cur = decayed(nowMs); const k = 1 - Math.pow(0.5, dt / (Math.abs(inst) >= Math.abs(cur) ? attackS : releaseS));
                    v = Math.max(-MAX_RATE, Math.min(MAX_RATE, cur + (inst - cur) * k)); vT = nowMs;
                }
                last = { jd, t: nowMs };
            },
            rate(nowMs) { return decayed(nowMs); },
            reset() { last = null; v = 0; vT = 0; }
        };
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

    return { span, isTimed, importanceFloor, selectVisible, notices, formatCountdown, shardKeys, dedupeAgainst, LEADS_S, windowFor, windowForGlide, shrinkWindow, GLIDE_HOLD, GLIDE_MIN_DAYS, windowImportance, ageFraction, fadeAlpha, createMotion, BASE_HALF_DAYS, HOLD_S, MAX_PAST_DAYS, MAX_RATE };
});
