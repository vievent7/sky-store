/**
 * ASTRO-ENGINE — Donnees astronomiques reelles + calculs exacts
 * ============================================================
 *
 * Signatures invariantes:
 *   geocodeLocation(locationName) → Promise<{lat, lng, displayName}>
 *   getSkyData(date, time, lat, lng)  → Promise<StarMapData>
 */

'use strict';

// ============================================================
// GEOCODAGE — Nominatim (OpenStreetMap)
// ============================================================

async function geocodeLocation(locationName) {
  const url = 'https://nominatim.openstreetmap.org/search?q='
    + encodeURIComponent(locationName) + '&format=json&limit=1';
  const response = await fetch(url, {
    headers: { 'User-Agent': 'SkyStore/1.0 (contact@skystore.com)' }
  });
  const data = await response.json();
  if (!data?.length) throw new Error('Lieu non trouve: ' + locationName);
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name
  };
}

// ============================================================
// CATALOGUE D'ETOILES — ~90 etoiles brillantes
// Coordonnees J2000.0 — donnees reelles
// ============================================================

const STAR_CATALOG = [
  // Magnitude < 0
  { name: 'Sirius',         ra: 101.287155, dec: -16.716116,  mag: -1.46, const: 'CMa' },
  { name: 'Canopus',        ra: 95.987989,  dec: -52.695655,  mag: -0.74, const: 'Car' },
  { name: 'Alpha Centauri', ra: 219.900832, dec: -60.835028,  mag: -0.27, const: 'Cen' },
  { name: 'Arcturus',       ra: 213.915348, dec: 19.182410,   mag: -0.05, const: 'Boo' },
  { name: 'Vega',           ra: 279.234743, dec: 38.783637,   mag: 0.03,  const: 'Lyr' },
  { name: 'Capella',        ra: 79.283228,  dec: 45.998033,   mag: 0.08,  const: 'Aur' },
  { name: 'Rigel',          ra: 78.634467,  dec: -8.201637,   mag: 0.13,  const: 'Ori' },
  { name: 'Procyon',        ra: 114.825943, dec: 5.224973,    mag: 0.34,  const: 'CMi' },
  { name: 'Betelgeuse',     ra: 78.634467,  dec: 7.406806,    mag: 0.42,  const: 'Ori' },
  { name: 'Achernar',       ra: 24.428477,  dec: -57.236611,  mag: 0.46,  const: 'Eri' },
  // Magnitude 0.5-1.0
  { name: 'Altair',         ra: 297.695793, dec: 8.868320,    mag: 0.76,  const: 'Aql' },
  { name: 'Aldebaran',      ra: 68.980163,  dec: 16.509302,   mag: 0.85,  const: 'Tau' },
  { name: 'Antares',        ra: 247.351772, dec: -26.431968,  mag: 0.96,  const: 'Sco' },
  { name: 'Spica',          ra: 201.298251, dec: -11.161407,  mag: 0.97,  const: 'Vir' },
  { name: 'Pollux',         ra: 116.329087, dec: 28.026178,   mag: 1.14,  const: 'Gem' },
  { name: 'Fomalhaut',      ra: 344.412692, dec: -29.622249,  mag: 1.16,  const: 'PsA' },
  { name: 'Deneb',          ra: 310.357983, dec: 45.280281,   mag: 1.25,  const: 'Cyg' },
  { name: 'Regulus',        ra: 152.092962, dec: 11.967219,   mag: 1.35,  const: 'Leo' },
  { name: 'Castor',         ra: 113.649595, dec: 31.888331,   mag: 1.58,  const: 'Gem' },
  { name: 'Bellatrix',      ra: 81.282161,  dec: 6.349727,    mag: 1.64,  const: 'Ori' },
  { name: 'Alnitak',        ra: 84.053561,  dec: -1.942470,   mag: 1.77,  const: 'Ori' },
  { name: 'Alioth',         ra: 193.507272, dec: 55.959795,   mag: 1.77,  const: 'UMa' },
  { name: 'Dubhe',          ra: 165.933412, dec: 61.751050,   mag: 1.79,  const: 'UMa' },
  { name: 'Alnilam',        ra: 84.412337,  dec: -1.201774,   mag: 1.69,  const: 'Ori' },
  { name: 'Saiph',          ra: 86.939355,  dec: -9.669875,   mag: 2.06,  const: 'Ori' },
  { name: 'Mintaka',        ra: 83.002230,  dec: -0.299092,   mag: 2.23,  const: 'Ori' },
  { name: 'Nunki',          ra: 283.808593, dec: -26.296691,  mag: 2.02,  const: 'Sgr' },
  { name: 'Kaus Australis', ra: 276.037511, dec: -34.384583,  mag: 1.85,  const: 'Sgr' },
  { name: 'Peacock',        ra: 306.412944, dec: -56.735149,  mag: 1.94,  const: 'Pav' },
  { name: 'Shaula',         ra: 263.558850, dec: -37.103791,  mag: 1.63,  const: 'Sco' },
  { name: 'Sargas',         ra: 264.328574, dec: -42.997799,  mag: 1.87,  const: 'Sco' },
  { name: 'Rasalhague',     ra: 264.326844, dec: 12.560021,   mag: 2.07,  const: 'Oph' },
  { name: 'Albireo',        ra: 292.680556, dec: 27.959028,   mag: 3.08,  const: 'Cyg' },
  { name: 'Sadr',           ra: 305.562083, dec: 40.256664,   mag: 2.20,  const: 'Cyg' },
  { name: 'Gienah',         ra: 311.554444, dec: 33.970278,   mag: 2.46,  const: 'Cyg' },
  { name: 'Denebola',       ra: 177.266840, dec: 14.571703,   mag: 2.14,  const: 'Leo' },
  { name: 'Algieba',        ra: 146.460289, dec: 19.841761,   mag: 2.08,  const: 'Leo' },
  { name: 'Chertan',        ra: 168.529903, dec: 14.871695,   mag: 2.97,  const: 'Leo' },
  { name: 'Zosma',          ra: 176.050139, dec: 20.523496,   mag: 2.56,  const: 'Leo' },
  { name: 'Ras Elased',     ra: 146.324389, dec: 23.766889,   mag: 2.98,  const: 'Leo' },
  { name: 'Adhafera',       ra: 145.295917, dec: 23.418778,   mag: 3.44,  const: 'Leo' },
  { name: 'Ankaa',          ra: 30.974305,  dec: -42.305156,  mag: 2.40,  const: 'Phe' },
  { name: 'Alnair',         ra: 332.060546, dec: -46.960875,  mag: 1.74,  const: 'Gru' },
  { name: 'Alphard',        ra: 141.896230, dec: -8.658519,   mag: 2.00,  const: 'Hya' },
  { name: 'Menkent',        ra: 213.916944, dec: -36.366944,  mag: 2.06,  const: 'Cen' },
  { name: 'Kornephoros',    ra: 251.405278, dec: 21.489444,   mag: 2.77,  const: 'Her' },
  { name: 'Rutilicus',      ra: 253.447778, dec: 24.836667,   mag: 2.81,  const: 'Her' },
  { name: 'Rasalgethi',     ra: 237.415972, dec: 30.563667,   mag: 3.48,  const: 'Her' },
  { name: 'Sabik',          ra: 247.351772, dec: -26.431968,  mag: 2.43,  const: 'Oph' },
  { name: 'Cebalrai',       ra: 269.152639, dec: 4.567778,    mag: 2.76,  const: 'Oph' },
  { name: 'Yed Prior',      ra: 264.894722, dec: -3.692778,   mag: 2.73,  const: 'Oph' },
  { name: 'Yed Posterior',  ra: 265.673056, dec: -4.692778,   mag: 3.31,  const: 'Oph' },
  { name: 'Schedar',        ra: 10.126842,  dec: 56.537332,   mag: 2.23,  const: 'Cas' },
  { name: 'Caph',           ra: 2.294222,   dec: 59.149861,   mag: 2.27,  const: 'Cas' },
  { name: 'Ruchbah',        ra: 21.450588,  dec: 60.235240,   mag: 2.68,  const: 'Cas' },
  { name: 'Segin',          ra: 28.603559,  dec: 63.670104,   mag: 3.37,  const: 'Cas' },
  { name: 'Hamal',          ra: 31.793070,  dec: 23.462342,   mag: 2.00,  const: 'Ari' },
  { name: 'Menkar',         ra: 43.503530,  dec: 4.089693,    mag: 2.53,  const: 'Cet' },
  { name: 'Mira',           ra: 41.699647,  dec: -2.976042,   mag: 3.04,  const: 'Cet' },
  { name: 'Algol',          ra: 47.041933,  dec: 40.955648,   mag: 2.12,  const: 'Per' },
  { name: 'Mirfak',         ra: 51.080742,  dec: 49.861301,   mag: 1.79,  const: 'Per' },
  { name: 'Alcyone',        ra: 56.870870,  dec: 24.105275,   mag: 2.87,  const: 'Tau' },
  { name: 'Elnath',         ra: 81.572938,  dec: 28.608053,   mag: 1.65,  const: 'Tau' },
  { name: 'Ain',            ra: 69.172682,  dec: 18.791052,   mag: 3.53,  const: 'Tau' },
  { name: 'Elm',            ra: 65.078610,  dec: 22.507778,   mag: 3.27,  const: 'Tau' },
  { name: 'Acamar',         ra: 74.494783,  dec: -40.304347,  mag: 3.20,  const: 'Eri' },
  { name: 'Zaurak',         ra: 25.640920,  dec: -7.642034,   mag: 3.42,  const: 'Eri' },
  { name: 'Mizar',          ra: 200.981427, dec: 54.925354,   mag: 2.04,  const: 'UMa' },
  { name: 'Merak',          ra: 165.460670, dec: 56.382431,   mag: 2.37,  const: 'UMa' },
  { name: 'Megrez',         ra: 183.855436, dec: 57.032576,   mag: 3.31,  const: 'UMa' },
  { name: 'Phad',           ra: 178.457841, dec: 53.694758,   mag: 2.44,  const: 'UMa' },
  { name: 'Alkaid',         ra: 206.885338, dec: 49.313309,   mag: 1.86,  const: 'UMa' },
  { name: 'Polaris',        ra: 37.954561,  dec: 89.264110,   mag: 1.98,  const: 'UMi' },
  { name: 'Kochab',         ra: 222.676111, dec: 74.155556,   mag: 2.08,  const: 'UMi' },
  { name: 'Pherkad',        ra: 229.764167, dec: 77.711389,   mag: 3.00,  const: 'UMi' },
  { name: 'Alderamin',      ra: 325.049028, dec: 62.585861,   mag: 2.51,  const: 'Cep' },
  { name: 'Alfirk',         ra: 342.627500, dec: 70.360556,   mag: 3.23,  const: 'Cep' },
  { name: 'Errai',          ra: 331.546667, dec: 77.649167,   mag: 3.21,  const: 'Cep' },
  { name: 'Mimosa',         ra: 191.933333, dec: -59.688889,  mag: 1.25,  const: 'Cru' },
  { name: 'Gacrux',         ra: 187.790833, dec: -57.113056,  mag: 1.59,  const: 'Cru' },
  { name: 'Dschubba',       ra: 240.083883, dec: -22.621667,  mag: 2.32,  const: 'Sco' },
  { name: 'Graffias',       ra: 236.067357, dec: -19.809440,  mag: 2.62,  const: 'Sco' },
  { name: 'Wei',            ra: 286.347413, dec: -10.162111,  mag: 2.50,  const: 'Sco' },
  { name: 'Lesath',         ra: 265.640350, dec: -37.295107,  mag: 2.69,  const: 'Sco' },
  { name: 'Cor Caroli',     ra: 193.509377, dec: 38.518519,   mag: 2.85,  const: 'CVn' },
  { name: 'Tarazed',        ra: 296.565000, dec: 10.613333,   mag: 2.72,  const: 'Aql' },
  { name: 'Alsahm',         ra: 294.300833, dec: 11.255000,   mag: 3.71,  const: 'Aql' },
  { name: 'Fawaris',        ra: 296.244444, dec: 45.130278,   mag: 2.87,  const: 'Cyg' },
  { name: 'Albeiro',        ra: 292.680556, dec: 33.316111,   mag: 3.08,  const: 'Cyg' },
];

// ============================================================
// LIGNES DE CONSTELLATIONS
// ============================================================

const CONSTELLATION_LINES = {
  Orion: [
    ['Betelgeuse','Bellatrix'],['Bellatrix','Alnitak'],
    ['Alnitak','Alnilam'],['Alnilam','Mintaka'],
    ['Mintaka','Rigel'],['Rigel','Saiph'],['Saiph','Betelgeuse'],
  ],
  'Grande Ourse': [
    ['Alioth','Megrez'],['Megrez','Dubhe'],['Dubhe','Merak'],
    ['Merak','Phad'],['Phad','Alioth'],['Dubhe','Mizar'],
    ['Mizar','Alkaid'],['Alioth','Mizar'],
  ],
  'Petite Ourse': [
    ['Polaris','Kochab'],['Kochab','Pherkad'],
  ],
  Cassiopee: [
    ['Segin','Ruchbah'],['Ruchbah','Schedar'],['Schedar','Caph'],
  ],
  Lion: [
    ['Regulus','Chertan'],['Chertan','Denebola'],['Denebola','Zosma'],
    ['Zosma','Algieba'],['Algieba','Ras Elased'],['Ras Elased','Adhafera'],
    ['Regulus','Zosma'],
  ],
  Scorpion: [
    ['Graffias','Dschubba'],['Dschubba','Wei'],['Wei','Shaula'],
    ['Shaula','Lesath'],['Wei','Antares'],['Antares','Graffias'],
  ],
  Cygne: [
    ['Deneb','Sadr'],['Sadr','Gienah'],['Gienah','Albireo'],
    ['Deneb','Fawaris'],['Fawaris','Sadr'],
  ],
  Gemeaux: [
    ['Pollux','Castor'],['Castor','Alcyone'],['Alcyone','Elnath'],
    ['Elnath','Aldebaran'],['Pollux','Elnath'],
  ],
  Taureau: [
    ['Aldebaran','Elnath'],['Elnath','Alcyone'],['Alcyone','Ain'],['Ain','Elm'],
  ],
  Persee: [
    ['Algol','Mirfak'],
  ],
  Hercule: [
    ['Kornephoros','Rasalgethi'],['Rasalgethi','Marfik'],
  ],
  Ophiuchus: [
    ['Rasalhague','Sabik'],['Sabik','Cebalrai'],['Cebalrai','Yed Prior'],
    ['Yed Prior','Yed Posterior'],
  ],
  Lyre: [
    ['Vega','Rutilicus'],
  ],
  Aigle: [
    ['Altair','Tarazed'],['Tarazed','Alsahm'],
  ],
  Eridan: [
    ['Achernar','Acamar'],['Acamar','Zaurak'],
  ],
  Centaure: [
    ['Alpha Centauri','Menkent'],['Menkent','Hadar'],
  ],
  Baleine: [
    ['Menkar','Mira'],
  ],
  Grue: [
    ['Alnair','Aldhanab'],
  ],
  Phenix: [
    ['Ankaa','Cina'],
  ],
  Pavo: [
    ['Peacock','Beta Pav'],
  ],
  Couronne: [
    ['Alphecca','Nusakan'],
  ],
  // Trajet approx Voie Lactee (axe Cygne -> Scout -> Cen -> Car)
  VoieLactee: [
    ['Deneb','Sadr'],['Sadr','Albireo'],
    ['Albireo','Tarazed'],['Tarazed','Altair'],
    ['Altair','Rasalhague'],['Rasalhague','Antares'],
    ['Antares','Shaula'],['Shaula','Wei'],
  ]
};

// ============================================================
// CALCULS ASTRONOMIQUES
// ============================================================

function computeLST(date, time, lng) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = (time || '21:00').split(':').map(Number);
  const jd = gregorianToJD(year, month, day, hour + minute / 60);
  const d = jd - 2451545.0;
  let gmst = (280.46061837 + 360.985647366569 * d) % 360;
  if (gmst < 0) gmst += 360;
  let lst = (gmst + lng) % 360;
  if (lst < 0) lst += 360;
  return lst;
}

function equatorialToHorizontal(ra, dec, lstDeg, latDeg) {
  const lst = lstDeg * Math.PI / 180;
  const raRad = ra * Math.PI / 180;
  const decRad = dec * Math.PI / 180;
  const lat = latDeg * Math.PI / 180;
  const ha = lst - raRad;

  const alt = Math.asin(
    Math.sin(decRad) * Math.sin(lat) +
    Math.cos(decRad) * Math.cos(lat) * Math.cos(ha)
  );

  const az = Math.atan2(
    -Math.cos(decRad) * Math.sin(ha),
    Math.sin(decRad) * Math.cos(lat) -
    Math.cos(decRad) * Math.sin(lat) * Math.cos(ha)
  );

  return {
    alt: alt * 180 / Math.PI,
    az: (az * 180 / Math.PI + 180) % 360
  };
}

function getMilkyWayBands(lat) {
  // Bandes approx de la VL pour differentes latitudes
  const vlVisible = Math.abs(lat) < 70;
  return vlVisible;
}

// ============================================================
// API PRINCIPALE
// ============================================================

/**
 * @param {string} date  YYYY-MM-DD
 * @param {string} time  HH:MM
 * @param {number} lat   latitude en degres
 * @param {number} lng   longitude en degres
 * @returns {Promise<StarMapData>}
 */
async function getSkyData(date, time, lat, lng) {
  const lst = computeLST(date, time, lng);

  const stars = STAR_CATALOG.map(star => {
    const { alt, az } = equatorialToHorizontal(star.ra, star.dec, lst, lat);
    if (alt < 0) return null;
    return {
      name: star.name,
      alt: Math.round(alt * 10) / 10,
      az: Math.round(az * 10) / 10,
      mag: star.mag,
      constellation: star.const,
      size: Math.max(1, Math.round((1.5 - Math.min(star.mag, 3)) * 2))
    };
  }).filter(Boolean);

  // Construire les lignes de constellations avec coordonnees alt/az reelles
  const constellations = {};
  for (const [name, lines] of Object.entries(CONSTELLATION_LINES)) {
    constellations[name] = lines.map(([aName, bName]) => {
      const starA = STAR_CATALOG.find(s => s.name === aName);
      const starB = STAR_CATALOG.find(s => s.name === bName);
      if (!starA || !starB) return null;
      const posA = equatorialToHorizontal(starA.ra, starA.dec, lst, lat);
      const posB = equatorialToHorizontal(starB.ra, starB.dec, lst, lat);
      if (posA.alt < 0 && posB.alt < 0) return null;
      return {
        from: { name: aName, alt: posA.alt, az: posA.az },
        to:   { name: bName, alt: posB.alt, az: posB.az }
      };
    }).filter(Boolean);
  }

  return {
    date,
    time: time || '21:00',
    location: { lat, lng },
    stars,
    constellations,
    moonPhase: getMoonPhase(date),
    milkyWayBands: getMilkyWayBands(lat)
  };
}

/** Phase de la Lune (simplifiee) */
function getMoonPhase(date) {
  const [y, m, d] = date.split('-').map(Number);
  const jd = gregorianToJD(y, m, d, 12);
  const daysSinceNew = (jd - 2451550.1) % 29.53059;
  return Math.round(daysSinceNew / 29.53059 * 100) / 100;
}

/** Jour Julien depuis date gregorienne */
function gregorianToJD(y, m, d, h) {
  if (m <= 2) { y--; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) + d + h / 24 + B - 1524.5;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  geocodeLocation,
  getSkyData,
  STAR_CATALOG,
  CONSTELLATION_LINES
};
