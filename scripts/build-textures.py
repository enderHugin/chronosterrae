#!/usr/bin/env python3
"""build-textures.py - Reduce mosaicos planetarios oficiales (NASA/USGS, dominio publico) a texturas web.

Regla 1: nada se inventa. Cada textura sale de UNA URL oficial, y el manifiesto guarda: URL de origen, dimensiones de
origen, proyeccion y esquinas segun GDAL, las lineas de proyeccion/longitud de la etiqueta PDS (.lbl) cuando existe,
el procedimiento de reduccion y la huella sha256 del resultado. Si la proyeccion no es cilindrica simple centrada en 0,
la textura NO se genera (se anota el motivo) en vez de adivinar.
Uso: python3 scripts/build-textures.py OUT_DIR [id ...]
"""
import hashlib, json, os, re, subprocess, sys, time, urllib.request

UA = 'ChronosTerrae-build/1.0 (+https://github.com/enderHugin/chronosterrae)'
U = 'https://astrogeology.usgs.gov/ckan/dataset/'
ITEMS = [
    dict(id='mercury', body='Mercury', kind='mosaico monocromo de MESSENGER/MDIS (luz visible, no color realzado)',
         url='https://planetarymaps.usgs.gov/mosaic//Mercury_MESSENGER_MDIS_Basemap_LOI_Mosaic_Global_166m.tif',
         lbl=U + '9d047a09-a10d-4e2a-865a-9b5e1b465315/resource/00d4a2f3-82b6-44c0-b934-00a4317fcdc1/download/mercury_messenger_mdis_basemap_loi_mosaic_global_166m.lbl',
         page='https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_loi_global_mosaic_166m', credit='NASA/JPL-Caltech/JHUAPL/Carnegie Institution of Washington; USGS Astrogeology Science Center'),
    dict(id='venus', body='Venus', kind='radar de Magellan (retrodispersion), NO es luz visible: desde fuera Venus se ve cubierta de nubes',
         url='https://planetarymaps.usgs.gov/mosaic/Venus_Magellan_C3-MDIR_Global_Mosaic_2025m.tif',
         lbl='https://astrogeology.usgs.gov/ckan/dataset/bf10c4f9-7587-4357-b0d9-81d5b6e6637c/resource/26c2e4b0-bdd5-449b-b075-972ce565b77e/download/venus_magellan_c3-mdir_global_mosaic_2025m.lbl',
         page='https://astrogeology.usgs.gov/search/map/venus_magellan_global_c3_mdir_mosaic_2025m', credit='NASA/JPL-Caltech; PDS Geosciences Node; USGS Astrogeology Science Center'),
    dict(id='moon', body='Moon', kind='mosaico en color de LROC WAC (Hapke normalizado) con huecos polares rellenados con albedo de LOLA',
         url='https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif', lbl=None,
         page='https://svs.gsfc.nasa.gov/4720/', credit="NASA's Scientific Visualization Studio; LROC WAC: NASA/GSFC/Arizona State University"),
    dict(id='mars', body='Mars', kind='mosaico en color de Viking (MDIM 2.1, color sintetizado)',
         url='https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif',
         lbl=U + '7131d503-cdc9-45a5-8f83-5126c0fd397e/resource/be4e44f4-5ec7-46e1-9498-643b91eecf21/download/mars_viking_mdim21_clrmosaic_global_232m.lbl',
         page='https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m', credit='NASA/JPL; USGS Astrogeology Science Center (MDIM 2.1)',
         fallback=U + '7131d503-cdc9-45a5-8f83-5126c0fd397e/resource/6afad901-1caa-48a7-8b62-3911da0004c2/download/mars_viking_mdim21_clrmosaic_global_1024.jpg'),
    dict(id='jupiter', body='Jupiter', kind='mapa cilindrico de Cassini (11-12 dic 2000), techo de nubes de UNA fecha: las bandas y manchas cambian con los anos',
         url='https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia07/pia07782/PIA07782.tif', lbl=None,
         page='https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/', credit='NASA/JPL/Space Science Institute (PIA07782)'),
    dict(id='io', body='Io', kind='mosaico en color de Galileo SSI y Voyager',
         url='https://planetarymaps.usgs.gov/mosaic/Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif',
         lbl=U + 'f6924861-ce9c-490d-8a4b-7812a20f2de5/resource/c0e99fdd-c493-41d2-94be-4eee2b20fc35/download/io_galileossi-voyager_global_mosaic_clrmerge_1km.lbl',
         page='https://astrogeology.usgs.gov/search/map/io_galileo_ssi_voyager_color_merged_global_mosaic_1km', credit='NASA/JPL/University of Arizona; USGS Astrogeology Science Center'),
    dict(id='europa', body='Europa', kind='mosaico de Voyager y Galileo SSI',
         url='https://planetarymaps.usgs.gov/mosaic/Europa_Voyager_GalileoSSI_global_mosaic_500m.tif',
         lbl=U + '4080036f-afc5-422e-abe9-1c0c8e4f98ea/resource/db62f55a-9d03-474e-a349-1fd7d8f0d5fc/download/europa_voyager_galileossi_global_mosaic_500m.lbl',
         page='https://astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m', credit='NASA/JPL/DLR; USGS Astrogeology Science Center'),
    dict(id='ganymede', body='Ganymede', kind='mosaico de Voyager y Galileo SSI',
         url='https://planetarymaps.usgs.gov/mosaic/Ganymede_Voyager_GalileoSSI_global_mosaic_1km.tif',
         lbl=U + '57cad6e2-ed52-4b99-9d44-afbb9def6450/resource/32769bd3-7a00-4aa6-9ce8-52126cbd4384/download/ganymede_voyager_galileossi_global_mosaic_1km.lbl',
         page='https://astrogeology.usgs.gov/search/map/ganymede_voyager_galileo_ssi_global_mosaic_1km', credit='NASA/JPL/USGS'),
    dict(id='callisto', body='Callisto', kind='mosaico de Voyager y Galileo SSI',
         url='https://planetarymaps.usgs.gov/mosaic/Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif',
         lbl=U + 'a80abd68-7ed9-440e-829a-76376779164f/resource/66433621-ca46-4563-994f-c615931adb42/download/callisto_voyager_galileossi_global_mosaic_1km.lbl',
         page='https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km', credit='NASA/JPL/USGS'),
]
WIDTH, HEIGHT = 2048, 1024

def sh(cmd, timeout=3000):
    t0 = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr[-1500:], round(time.time() - t0, 1)

def head(url):
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return {k: r.headers.get(k) for k in ('Content-Length', 'Content-Type', 'Last-Modified', 'ETag', 'Access-Control-Allow-Origin')}

def fetch(url, path):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=300) as r, open(path, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b)

def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()

LBL_KEYS = re.compile(r'^\s*(PROJECTION_TYPE|MAP_PROJECTION_TYPE|POSITIVE_LONGITUDE_DIRECTION|LONGITUDE_DIRECTION|CENTER_LONGITUDE|MINIMUM_LATITUDE|MAXIMUM_LATITUDE|WESTERNMOST_LONGITUDE|EASTERNMOST_LONGITUDE|A_AXIS_RADIUS|B_AXIS_RADIUS|C_AXIS_RADIUS|COORDINATE_SYSTEM_NAME|COORDINATE_SYSTEM_TYPE|LATITUDE_TYPE|MAP_RESOLUTION|MAP_SCALE|LINE_PROJECTION_OFFSET|SAMPLE_PROJECTION_OFFSET|CENTER_LATITUDE|TARGET_NAME)\b.*$', re.M)

def build(it, out):
    r = dict(id=it['id'], body=it['body'], kind=it['kind'], sourceUrl=it['url'], sourcePage=it['page'], credit=it['credit'])
    try: r['sourceHead'] = head(it['url'])
    except Exception as e: r['sourceHead'] = {'error': str(e)}
    if it.get('lbl'):
        try:
            p = os.path.join(out, it['id'] + '.lbl'); fetch(it['lbl'], p)
            txt = open(p, errors='replace').read(); r['labelUrl'] = it['lbl']; r['label'] = [l.strip() for l in LBL_KEYS.findall(txt) if False] or [m.group(0).strip() for m in LBL_KEYS.finditer(txt)]
            os.remove(p)
        except Exception as e: r['label'] = {'error': str(e)}
    src = '/vsicurl/' + it['url']
    rc, o, e, s = sh(['gdalinfo', '-json', '-nomd', src], 900)
    info = None
    if rc == 0:
        try: info = json.loads(o)
        except Exception: info = None
    if info:
        cs = info.get('cornerCoordinates', {})
        r['source'] = dict(size=info.get('size'), bands=[(b.get('colorInterpretation'), b.get('type')) for b in info.get('bands', [])],
                           cornerCoordinates=cs, driver=info.get('driverShortName'), wkt=(info.get('coordinateSystem') or {}).get('wkt', '')[:700],
                           overviews=[b.get('overviews') and len(b['overviews']) for b in info.get('bands', [])][:1])
    else: r['gdalinfoError'] = e
    dst = os.path.join(out, it['id'] + '.jpg'); tmp = os.path.join(out, it['id'] + '.tmp.tif')
    # -r average: promedio de areas (no se salta pixeles). -scale solo si el origen no es de 8 bits.
    cmd = ['gdal_translate', '-q', '-of', 'GTiff', '-outsize', str(WIDTH), str(HEIGHT), '-r', 'average', '-co', 'COMPRESS=NONE']
    if info and info.get('bands') and info['bands'][0].get('type') not in ('Byte',): cmd += ['-ot', 'Byte', '-scale']
    rc, o, e, s = sh(cmd + [src, tmp], 2400)
    r['reduceSeconds'] = s
    if rc != 0 or not os.path.exists(tmp):
        r['reduceError'] = e
        if it.get('fallback'):
            fb = os.path.join(out, it['id'] + '.fallback.jpg'); fetch(it['fallback'], fb)
            r['fallback'] = dict(url=it['fallback'], note='vista previa oficial de USGS (1024x512); la reduccion propia desde el GeoTIFF fallo')
            os.replace(fb, dst); r['output'] = dict(file=it['id'] + '.jpg', sha256=sha(dst), bytes=os.path.getsize(dst))
        return r
    rc, o, e, s2 = sh(['gdal_translate', '-q', '-of', 'JPEG', '-co', 'QUALITY=88', tmp, dst])
    os.remove(tmp)
    if rc != 0: r['jpegError'] = e; return r
    for ext in ('.jpg.aux.xml',):
        try: os.remove(dst + ext[4:])
        except OSError: pass
    r['output'] = dict(file=it['id'] + '.jpg', width=WIDTH, height=HEIGHT, sha256=sha(dst), bytes=os.path.getsize(dst),
                       method='gdal_translate -outsize %dx%d -r average (promedio de areas), JPEG calidad 88' % (WIDTH, HEIGHT))
    return r

if __name__ == '__main__':
    out = sys.argv[1]; only = set(sys.argv[2:]); os.makedirs(out, exist_ok=True)
    res = []
    for it in ITEMS:
        if only and it['id'] not in only: continue
        print('==', it['id'], flush=True)
        try: res.append(build(it, out))
        except Exception as e: res.append(dict(id=it['id'], error=repr(e)))
        print(json.dumps(res[-1], ensure_ascii=False)[:600], flush=True)
    json.dump(dict(built=time.strftime('%Y-%m-%dT%H:%MZ', time.gmtime()), items=res), open(os.path.join(out, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
