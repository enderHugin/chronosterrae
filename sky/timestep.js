/* timestep.js - Paso de las teclas de direccion con el deslizador de tiempo en foco (sin DOM: navegador y Node).
 *
 * El usuario elige cuanto avanza cada pulsacion, de 1 minuto a 100 millones de anos. Con reloj (de la ventana del cielo a hoy) el
 * paso es de calendario: minutos a semanas son segundos exactos; mes, ano, siglo, milenio... conservan mes, dia y hora (con el dia
 * recortado si el mes de llegada no lo tiene, y respetando el salto de 1582). Sin reloj (tiempo profundo) el instante solo tiene
 * resolucion de 1 ano: un paso menor se redondea a 1 ano y se avisa (note: 'minYear'). Nunca se inventa un instante: si el calendario
 * no admite el dia, se baja al ultimo dia valido del mes.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronosTimeStep = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const YEAR_S = 31557600;      // ano juliano en segundos: solo para convertir un paso en segundos a anos (tiempo profundo)
    // kind: 'sec' = segundos exactos; 'month' / 'year' = aritmetica de calendario (n meses / n anos).
    const STEPS = [
        { id: '1m', kind: 'sec', n: 60, es: '1 minuto', en: '1 minute' },
        { id: '10m', kind: 'sec', n: 600, es: '10 minutos', en: '10 minutes' },
        { id: '1h', kind: 'sec', n: 3600, es: '1 hora', en: '1 hour' },
        { id: '6h', kind: 'sec', n: 21600, es: '6 horas', en: '6 hours' },
        { id: '1d', kind: 'sec', n: 86400, es: '1 día', en: '1 day' },
        { id: '1w', kind: 'sec', n: 604800, es: '1 semana', en: '1 week' },
        { id: '1mo', kind: 'month', n: 1, es: '1 mes', en: '1 month' },
        { id: '1y', kind: 'year', n: 1, es: '1 año', en: '1 year' },
        { id: '10y', kind: 'year', n: 10, es: '10 años', en: '10 years' },
        { id: '1c', kind: 'year', n: 100, es: '1 siglo', en: '1 century' },
        { id: '1k', kind: 'year', n: 1000, es: '1 milenio', en: '1 millennium' },
        { id: '10k', kind: 'year', n: 10000, es: '10 milenios', en: '10 millennia' },
        { id: '100k', kind: 'year', n: 100000, es: '100 milenios', en: '100 millennia' },
        { id: '1M', kind: 'year', n: 1e6, es: '1 millón de años', en: '1 million years' },
        { id: '10M', kind: 'year', n: 1e7, es: '10 millones de años', en: '10 million years' },
        { id: '100M', kind: 'year', n: 1e8, es: '100 millones de años', en: '100 million years' }
    ];
    const DEFAULT_ID = '1y';
    const byId = (id) => STEPS.find((s) => s.id === id) || null;

    const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };
    const stepYears = (s) => (s.kind === 'sec' ? s.n / YEAR_S : s.kind === 'month' ? s.n / 12 : s.n);

    /**
     * Calcula el instante al que llevaria UNA pulsacion (o varias: count).
     * @param {object} Sky  ChronosSky (jdToCalendar, calendarToJD)
     * @param {object} ctx  { jd: dia juliano UT del reloj o NaN si no hay reloj, ybp, minYear, nowYear, present, minJD, maxJD, minYbp, maxYbp }
     * @param {string} id   id del paso
     * @param {number} signed  +n hacia el presente, -n hacia el pasado (entero distinto de 0)
     * @returns {{jd:number}|{ybp:number, note?:string}}  jd: mover el reloj; ybp: mover el deslizador (y el reloj se recalcula solo)
     */
    function move(Sky, ctx, id, signed) {
        const s = byId(id);
        if (!s) throw fail('BAD_STEP', 'paso desconocido: ' + id);
        if (!Number.isInteger(signed) || signed === 0) throw fail('BAD_COUNT', 'el numero de pasos debe ser un entero distinto de 0');
        const clockOk = Number.isFinite(ctx.jd);
        const ybpOfYear = (year) => Math.min(ctx.maxYbp, Math.max(ctx.minYbp, Math.round(ctx.present - year)));

        if (clockOk) {
            if (s.kind === 'sec') {
                const jd = ctx.jd + signed * s.n / 86400;
                if (jd > ctx.maxJD) return { jd: ctx.maxJD, clipped: true };
                if (jd < ctx.minJD) return { jd: ctx.minJD, clipped: true };
                return { jd };
            }
            const c = Sky.jdToCalendar(ctx.jd, 'auto');
            const frac = ((ctx.jd + 0.5) % 1 + 1) % 1;                                         // hora del dia: se conserva
            const months = s.kind === 'month' ? signed * s.n : 0;
            const total = c.year * 12 + (c.month - 1) + months;
            const year2 = s.kind === 'month' ? Math.floor(total / 12) : c.year + signed * s.n;
            const month2 = s.kind === 'month' ? total - year2 * 12 + 1 : c.month;
            if (year2 > ctx.nowYear) return { jd: ctx.maxJD, clipped: true };
            if (year2 < ctx.minYear) return { ybp: ybpOfYear(year2), clipped: ctx.present - year2 > ctx.maxYbp };   // sale de la ventana del reloj
            for (let d = c.day; d >= 1; d--) {                                                  // el dia puede no existir en el mes de llegada
                let day0;
                try { day0 = Sky.calendarToJD({ year: year2, month: month2, day: d, hour: 0 }, 'auto').jd; } catch (e) { if (e.code === 'BAD_DATE' || e.code === 'SKIPPED_DATE') continue; throw e; }
                const jd = day0 + frac;
                if (jd > ctx.maxJD) return { jd: ctx.maxJD, clipped: true };
                if (jd < ctx.minJD) return { jd: ctx.minJD, clipped: true };
                return { jd };
            }
            throw fail('NO_DAY', 'ningun dia valido en ' + year2 + '-' + month2);                // no deberia ocurrir: el dia 1 siempre existe
        }
        // Sin reloj: resolucion de 1 ano
        const years = stepYears(s); const eff = Math.max(1, Math.round(years));
        const ybp = Math.round(ctx.ybp - signed * eff);
        const out = { ybp: Math.min(ctx.maxYbp, Math.max(ctx.minYbp, ybp)) };
        if (years < 1) out.note = 'minYear';
        if (out.ybp !== ybp) out.clipped = true;
        return out;
    }

    return { STEPS, DEFAULT_ID, byId, move, stepYears };
});
