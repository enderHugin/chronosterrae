/* sky.js - Calculo del cielo de ChronosTerrae (sin DOM: se usa igual en el navegador y en Node).
 *
 * Que calcula, para un instante, un lugar y un calendario:
 *   - Sol, Luna (con fase), Mercurio..Neptuno: posicion, altitud/azimut, magnitud (astronomy-engine, MIT).
 *   - Estrellas Hipparcos con movimiento propio y precesion/nutacion hasta la fecha pedida.
 *   - Crepusculo segun la altura del Sol.
 *
 * Que NO hace (y la interfaz lo dice): aberracion ni paralaje de las estrellas, aceleracion de
 * perspectiva de las muy cercanas, ni estrellas variables. Es un modelo, no una observacion.
 *
 * Tiempo: se trabaja en dia juliano UT. La conversion calendario <-> dia juliano es propia porque
 * el motor solo conoce el calendario gregoriano proleptico y la historia usa el juliano hasta 1582.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('astronomy-engine'));
    else root.ChronosSky = factory(root.Astronomy);
})(typeof self !== 'undefined' ? self : this, function (Astronomy) {
    'use strict';

    const J2000_JD = 2451545.0;
    const GREGORIAN_REFORM_JD = 2299160.5;   // 1582-10-15 a las 0 h: primer dia gregoriano
    const DEG = Math.PI / 180;
    const RAD = 180 / Math.PI;

    // Ventana de epocas en que se ofrece cielo calculado (anio astronomico: el 0 existe).
    // Se ajusta con los errores medidos contra JPL Horizons (data/sky/validation.json).
    const WINDOW = { minYear: -2000, maxYear: 3000 };

    /* ---------------------------------------------------------------- */
    /* Calendario <-> dia juliano                                        */
    /* ---------------------------------------------------------------- */
    const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };

    const isLeap = (year, gregorian) => (gregorian ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) : year % 4 === 0);
    const daysInMonth = (year, month, gregorian) => [31, isLeap(year, gregorian) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

    // Meeus, "Astronomical Algorithms", cap. 7. d puede llevar fraccion.
    function jdFromYMD(year, month, day, gregorian) {
        let y = year;
        let m = month;
        if (m <= 2) { y -= 1; m += 12; }
        let b = 0;
        if (gregorian) { const a = Math.floor(y / 100); b = 2 - a + Math.floor(a / 4); }
        return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
    }

    /**
     * @param {{year:number,month:number,day:number,hour?:number,minute?:number,second?:number}} c  hora UT
     * @param {'auto'|'julian'|'gregorian'} calendar  auto = juliano hasta el 4-10-1582, gregoriano desde el 15-10-1582
     * @returns {{jd:number, calendar:'julian'|'gregorian'}}
     */
    function calendarToJD(c, calendar = 'auto') {
        const { year, month, day } = c;
        const hour = c.hour || 0;
        const minute = c.minute || 0;
        const second = c.second || 0;
        if (![year, month, day, hour, minute, second].every(Number.isFinite)) throw fail('BAD_DATE', 'fecha incompleta');
        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) throw fail('BAD_DATE', 'anio, mes y dia deben ser enteros');
        if (month < 1 || month > 12) throw fail('BAD_DATE', 'mes fuera de rango');
        if (hour < 0 || hour >= 24 || minute < 0 || minute >= 60 || second < 0 || second >= 60) throw fail('BAD_DATE', 'hora fuera de rango');
        let gregorian;
        if (calendar === 'gregorian') gregorian = true;
        else if (calendar === 'julian') gregorian = false;
        else if (calendar === 'auto') {
            const key = year * 10000 + month * 100 + day;
            if (key >= 15821015) gregorian = true;
            else if (key <= 15821004) gregorian = false;
            else throw fail('SKIPPED_DATE', 'esa fecha no existe: el 4 de octubre de 1582 (juliano) siguio el 15 de octubre (gregoriano)');
        } else throw fail('BAD_CALENDAR', 'calendario desconocido: ' + calendar);
        if (day < 1 || day > daysInMonth(year, month, gregorian)) throw fail('BAD_DATE', 'dia fuera de rango para ese mes y calendario');
        const jd = jdFromYMD(year, month, day, gregorian) + (hour + minute / 60 + second / 3600) / 24;
        return { jd, calendar: gregorian ? 'gregorian' : 'julian' };
    }

    function jdToCalendar(jd, calendar = 'auto') {
        const j = jd + 0.5;
        const z = Math.floor(j);
        const f = j - z;
        const gregorian = calendar === 'gregorian' || (calendar === 'auto' && jd >= GREGORIAN_REFORM_JD);
        let a = z;
        if (gregorian) {
            const alpha = Math.floor((z - 1867216.25) / 36524.25);
            a = z + 1 + alpha - Math.floor(alpha / 4);
        }
        const b = a + 1524;
        const c = Math.floor((b - 122.1) / 365.25);
        const d = Math.floor(365.25 * c);
        const e = Math.floor((b - d) / 30.6001);
        const day = b - d - Math.floor(30.6001 * e);
        const month = e < 14 ? e - 1 : e - 13;
        const year = month > 2 ? c - 4716 : c - 4715;
        const secs = Math.min(86399.999, Math.round(f * 86400 * 1000) / 1000);
        return {
            year, month, day,
            hour: Math.floor(secs / 3600),
            minute: Math.floor((secs % 3600) / 60),
            second: secs % 60,
            calendar: gregorian ? 'gregorian' : 'julian'
        };
    }

    // Hora solar media local (la que usaba la gente antes de los husos horarios, 1884) -> UT, en horas.
    // La ecuacion del tiempo no se aplica: el reloj de sol y el medio difieren hasta ~16 min.
    const localMeanSolarToUT = (hours, lonDeg) => hours - lonDeg / 15;

    /* ---------------------------------------------------------------- */
    /* Catalogo estelar                                                  */
    /* ---------------------------------------------------------------- */
    const MAS_TO_RAD = (Math.PI / 180) / 3600000;

    /**
     * @param raw      contenido de data/sky/stars.json
     * @param constel  contenido de data/sky/constellations.json (opcional)
     */
    function prepareCatalog(raw, constel) {
        const f = raw.fields;
        const col = (name) => { const i = f.indexOf(name); if (i < 0) throw new Error('catalogo sin columna ' + name); return i; };
        const iHip = col('hip'); const iRa = col('ra_deg'); const iDec = col('dec_deg');
        const iPmra = col('pmra_mas_yr'); const iPmde = col('pmde_mas_yr'); const iPlx = col('plx_mas');
        const iMag = col('vmag'); const iBv = col('bv');
        const n = raw.stars.length;
        const cat = {
            n,
            epochJD: J2000_JD + (raw.epoch_jyear - 2000) * 365.25,
            hip: new Int32Array(n), ra: new Float64Array(n), dec: new Float64Array(n),
            pmra: new Float64Array(n), pmde: new Float64Array(n), plx: new Float32Array(n),
            mag: new Float32Array(n), bv: new Float32Array(n),
            names: raw.names || {},
            index: new Map(),
            constellations: []
        };
        raw.stars.forEach((s, i) => {
            cat.hip[i] = s[iHip];
            cat.ra[i] = s[iRa] * DEG; cat.dec[i] = s[iDec] * DEG;
            cat.pmra[i] = s[iPmra] * MAS_TO_RAD; cat.pmde[i] = s[iPmde] * MAS_TO_RAD;
            cat.plx[i] = s[iPlx]; cat.mag[i] = s[iMag];
            cat.bv[i] = s[iBv] === null ? NaN : s[iBv];
            cat.index.set(s[iHip], i);
        });
        if (constel && Array.isArray(constel.constellations)) {
            cat.constellations = constel.constellations.map((c) => ({
                id: c.id, la: c.la, en: c.en, es: c.es,
                lines: c.lines.map(([a, b]) => [cat.index.get(a), cat.index.get(b)]).filter(([a, b]) => a !== undefined && b !== undefined)
            }));
        }
        return cat;
    }

    /**
     * Posicion aparente de todas las estrellas del catalogo en el instante dado.
     * Movimiento propio lineal en el plano tangente desde la epoca del catalogo, precesion y nutacion
     * (matriz J2000 -> ecuador de la fecha de astronomy-engine), refraccion normal.
     */
    function starPositions(cat, time, latDeg, lonDeg) {
        const n = cat.n;
        const out = { ra: new Float64Array(n), dec: new Float64Array(n), alt: new Float64Array(n), az: new Float64Array(n) };
        const dtYears = ((time.tt + J2000_JD) - cat.epochJD) / 365.25;
        const rot = Astronomy.Rotation_EQJ_EQD(time).rot;
        const gastDeg = Astronomy.SiderealTime(time) * 15;
        const phi = latDeg * DEG;
        const sinPhi = Math.sin(phi); const cosPhi = Math.cos(phi);
        for (let i = 0; i < n; i++) {
            const ra0 = cat.ra[i]; const dec0 = cat.dec[i];
            const sa = Math.sin(ra0); const ca = Math.cos(ra0); const sd = Math.sin(dec0); const cd = Math.cos(dec0);
            const pa = cat.pmra[i]; const pd = cat.pmde[i];
            let x = cd * ca + dtYears * (-pa * sa - pd * sd * ca);
            let y = cd * sa + dtYears * (pa * ca - pd * sd * sa);
            let z = sd + dtYears * (pd * cd);
            const norm = Math.sqrt(x * x + y * y + z * z);
            x /= norm; y /= norm; z /= norm;
            // RotateVector: v'[i] = sum_j rot[j][i] * v[j]
            const ex = rot[0][0] * x + rot[1][0] * y + rot[2][0] * z;
            const ey = rot[0][1] * x + rot[1][1] * y + rot[2][1] * z;
            const ez = rot[0][2] * x + rot[1][2] * y + rot[2][2] * z;
            let ra = Math.atan2(ey, ex); if (ra < 0) ra += 2 * Math.PI;
            const dec = Math.asin(Math.max(-1, Math.min(1, ez)));
            const hourAngle = gastDeg * DEG + lonDeg * DEG - ra;
            const sinH = Math.sin(hourAngle); const cosH = Math.cos(hourAngle);
            const sinAlt = sinPhi * Math.sin(dec) + cosPhi * Math.cos(dec) * cosH;
            let alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD;
            let az = Math.atan2(-Math.cos(dec) * sinH, Math.sin(dec) * cosPhi - Math.cos(dec) * cosH * sinPhi) * RAD;
            if (az < 0) az += 360;
            alt += Astronomy.Refraction('normal', alt);   // igual que Astronomy.Horizon(..., 'normal')
            out.ra[i] = ra * RAD / 15; out.dec[i] = dec * RAD; out.alt[i] = alt; out.az[i] = az;
        }
        return out;
    }

    /* ---------------------------------------------------------------- */
    /* Cuerpos del Sistema Solar                                         */
    /* ---------------------------------------------------------------- */
    const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

    function bodyPosition(id, time, observer) {
        const body = Astronomy.Body[id];
        const eq = Astronomy.Equator(body, time, observer, true, true);          // de la fecha, con aberracion y paralaje
        const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal');
        const geo = Astronomy.Horizon(time, observer, eq.ra, eq.dec, null);
        const ill = Astronomy.Illumination(body, time);
        const res = {
            id, ra: eq.ra, dec: eq.dec, alt: hor.altitude, az: hor.azimuth, altGeometric: geo.altitude,
            distAU: eq.dist, mag: ill.mag, phaseFraction: ill.phase_fraction
        };
        if (id === 'Moon') res.phaseAngle = Astronomy.MoonPhase(time);   // 0 nueva, 90 cuarto creciente, 180 llena, 270 cuarto menguante
        return res;
    }

    function twilightOf(sunAltGeometric) {
        if (sunAltGeometric > -0.833) return 'day';
        if (sunAltGeometric > -6) return 'civil';
        if (sunAltGeometric > -12) return 'nautical';
        if (sunAltGeometric > -18) return 'astronomical';
        return 'night';
    }

    /**
     * @param {{jd:number, lat:number, lon:number, elevation?:number, catalog?:object}} o  jd en UT; lon este positivo
     */
    function skyAt(o) {
        const { jd, lat, lon } = o;
        if (![jd, lat, lon].every(Number.isFinite)) throw fail('BAD_INPUT', 'faltan jd, lat o lon');
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw fail('BAD_INPUT', 'lugar fuera de rango');
        const time = new Astronomy.AstroTime(jd - J2000_JD);
        const observer = new Astronomy.Observer(lat, lon, o.elevation || 0);
        const bodies = BODIES.map((id) => bodyPosition(id, time, observer));
        const sun = bodies[0];
        const out = {
            jd,
            deltaTSeconds: (time.tt - time.ut) * 86400,
            siderealHours: Astronomy.SiderealTime(time),
            twilight: twilightOf(sun.altGeometric),
            sun,
            moon: bodies[1],
            planets: bodies.slice(2),
            stars: o.catalog ? starPositions(o.catalog, time, lat, lon) : null
        };
        return out;
    }

    return {
        WINDOW, J2000_JD, GREGORIAN_REFORM_JD, BODIES,
        calendarToJD, jdToCalendar, isLeap, daysInMonth, localMeanSolarToUT,
        prepareCatalog, starPositions, skyAt, twilightOf, bodyPosition
    };
});
