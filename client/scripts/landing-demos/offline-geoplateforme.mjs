// Preloaded into the local API to record demo-journey (record.mjs) without asking any outside
// service, from server/:
//
//   COMMUTE_TIMES=true bun --preload ../client/scripts/landing-demos/offline-geoplateforme.mjs index.ts
//
// It replaces the API's fetch: the Géoplateforme's geocoding and routes are answered here for the
// two addresses of seed.mjs (Jane's in Lyon, the job's office in Grenoble), with times from the
// distance between them (88 km/h and 6 minutes by car, 4.8 km/h on foot); every other outside host
// is refused, localhost goes through. The film shows only the commute's outcome, never a time,
// and credits the Géoplateforme as the page does: recorded this way, its travel times are
// illustrative, not IGN's. Without it the API asks the Géoplateforme itself.
const realFetch = globalThis.fetch;

const places = [
	{
		match: /bellecour/i,
		label: 'Place Bellecour 69002 Lyon',
		lon: 4.8322,
		lat: 45.7578,
		name: 'Place Bellecour',
		postcode: '69002',
		city: 'Lyon'
	},
	{
		match: /victor hugo|grenoble/i,
		label: '5 Place Victor Hugo 38000 Grenoble',
		lon: 5.7245,
		lat: 45.1889,
		name: '5 Place Victor Hugo',
		postcode: '38000',
		city: 'Grenoble'
	}
];

const json = (body, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Meters between two [lon, lat] points */
const haversine = ([lon1, lat1], [lon2, lat2]) => {
	const rad = (degrees) => (degrees * Math.PI) / 180;
	const h =
		Math.sin(rad(lat2 - lat1) / 2) ** 2 +
		Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
	return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};

const log = (line) => console.error(`[offline-geoplateforme] ${line}`);

globalThis.fetch = async (input, init) => {
	const url = new URL(
		typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
	);
	if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return realFetch(input, init);
	if (url.hostname === 'data.geopf.fr' && url.pathname === '/geocodage/search') {
		const place = places.find((candidate) => candidate.match.test(url.searchParams.get('q') ?? ''));
		log(`geocode: ${place ? place.city : 'nothing'}`);
		if (!place) return json({ features: [] });
		const town = url.searchParams.get('type') === 'municipality';
		return json({
			features: [
				{
					geometry: { coordinates: [place.lon, place.lat] },
					properties: {
						label: town ? place.city : place.label,
						score: 0.95,
						type: town ? 'municipality' : 'housenumber',
						name: town ? place.city : place.name,
						postcode: place.postcode,
						city: place.city
					}
				}
			]
		});
	}
	if (url.hostname === 'data.geopf.fr' && url.pathname === '/navigation/itineraire') {
		const point = (name) => (url.searchParams.get(name) ?? '').split(',').map(Number);
		const meters = Math.round(haversine(point('start'), point('end')) * 1.18);
		const car = url.searchParams.get('profile') === 'car';
		const minutes = car
			? Math.round((meters / 1000 / 88) * 60 + 6)
			: Math.round((meters / 1000 / 4.8) * 60);
		log(`route by ${car ? 'car' : 'foot'}: ${minutes} min`);
		return json({ duration: minutes, distance: meters });
	}
	log(`refused ${url.hostname}`);
	throw new TypeError(`offline-geoplateforme: no outside call (${url.hostname})`);
};
log('fetch replaced');
