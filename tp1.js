const parser = require('fast-xml-parser');
const fs = require('fs');
const {v4: uuid} = require('uuid');
const axios = require('axios').default;
const SparqlClient = require('sparql-http-client')
const cors = require('cors');

const express = require('express');
const app = express();
app.use(cors());
const port = 2999;

const schemeHeader = "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n" +
    "@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.\n" +
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . \n\n" +
    "@prefix : <http://cui.unige.ch/> . \n\n"


console.log("TWS converter");

function parseGPX(gpxFile) {
    let trackPoints = gpxFile.child.gpx[0].child.trk[0];
    let waypoints = gpxFile.child.gpx[0].child.wpt;
    let trackName = trackPoints.child.name[0].val;
    let points = trackPoints.child.trkseg[0].child.trkpt;

    let parsedPoints = [];
    points.forEach(point => {
        let parsedPoint = {
            lat: Number(point.attrsMap["@_lat"]),
            lon: Number(point.attrsMap["@_lon"]),
            ele: point.child.ele[0].val,
            time: Date.parse(point.child.time[0].val)
        };
        parsedPoints.push(parsedPoint);
    });

    waypoints.forEach(waypoint => {
        let parsedWaypoint = {
            lat: Number(waypoint.attrsMap["@_lat"]),
            lon: Number(waypoint.attrsMap["@_lon"]),
            ele: waypoint.child.ele[0].val,
            name: waypoint.child.name[0].val
        };
        for (let point of parsedPoints) {
            if (point.lat === parsedWaypoint.lat && point.lon === parsedWaypoint.lon) {
                point.waypoint = parsedWaypoint;
                break;
            }
        }
    });

    return {name: trackName, trackPoints: parsedPoints};
}

function generateGraphDBPoint(point) {
    let pointId = ':swt-trkpt-' + uuid();
    let schemeString = pointId + ' a :Trackpoint . \n';
    schemeString += pointId + ' :lat ' + point.lat + ' .\n';
    schemeString += pointId + ' :lon ' + point.lon + ' .\n';
    schemeString += pointId + ' :ele ' + point.ele + ' .\n';
    schemeString += pointId + ' :time ' + point.time + ' .\n';
    if (point.poi) {
        let generatedPOI = generateGraphDBPoi(point.poi);
        schemeString += generatedPOI.value;
        schemeString += pointId + ' :hasClosePOI ' + generatedPOI.id + ' .\n';
    }
    if (point.waypoint) {
        let generatedWaypoint = generateGraphDBWaypoint(point.waypoint);
        schemeString += generatedWaypoint.value;
        schemeString += pointId + ' :hasWaypoint ' + generatedWaypoint.id + ' .\n';
    }

    return {id: pointId, value: schemeString};
}

function generateGraphDBWaypoint(waypoint) {
    let waypointId = ':swt-wpt-' + uuid();
    let schemeString = waypointId + ' a :Waypoint . \n';
    schemeString += waypointId + ' :name "' + waypoint.name + '" .\n';

    return {id: waypointId, value: schemeString};
}

function generateGraphDBPoi(poi) {
    let poiId = ':swt-poi-' + poi.id;
    let schemeString = poiId + ' a :POI . \n';
    schemeString += poiId + ' :lat ' + poi.lat + ' .\n';
    schemeString += poiId + ' :lon ' + poi.lon + ' .\n';
    if (poi.tags.name) {
        let clearedName = poi.tags.name.replace(/"/g, "");
        schemeString += poiId + ' :name "' + clearedName + '" .\n';
        if (poi.tags.tourism) {
            schemeString += poiId + ' :type "tourism" .\n';
        } else if (poi.tags.natural) {
            schemeString += poiId + ' :type "natural" .\n';
        } else if (poi.tags.amenity) {
            schemeString += poiId + ' :type "amenity" .\n';
        } else if (poi.tags.sport) {
            schemeString += poiId + ' :type "sport" .\n';
        }
    }
    return {id: poiId, value: schemeString};
}


function generateGraphDBScheme(gpx) {
    let trackId = ':swt-trk-' + uuid();
    let pointsScheme = '';
    let pointIds = [];
    gpx.trackPoints.forEach((point) => {
        let graphDbPoint = generateGraphDBPoint(point);
        pointsScheme += graphDbPoint.value + "\n";
        pointIds.push(graphDbPoint.id);
    });
    let schemeString = schemeHeader + pointsScheme + trackId + ' a :Track . \n';
    schemeString += trackId + ' :name "' + gpx.name + '" .\n';
    schemeString += ':trackpoints a rdf:Seq .\n';

    pointIds.forEach((id) => {
        schemeString += trackId + ' :trackpoints ' + id + ' .\n';
    });


    return schemeString;
}

async function fetchOSMData(bounds) {
    let response = await axios.get('https://api.openstreetmap.org/api/0.6/map?bbox=' + bounds.bottomLeft.lon + ',' + bounds.bottomLeft.lat + ',' + bounds.topRight.lon + ',' + bounds.topRight.lat);
    let elements = response.data.elements;
    let filteredElements = [];
    if (elements) {
        elements.forEach(element => {
            if (element.type === 'node' && element.tags && (element.tags.tourism || element.tags.natural || element.tags.amenity || element.tags.sport)) {
                filteredElements.push({id: element.id, lat: element.lat, lon: element.lon, tags: element.tags});
            }
        });
    }
    return filteredElements;
}

function findBounds(points) {
    let topRightPoint = points[0];
    let bottomLeftPoint = points[1];
    points.forEach((point) => {
        if (point.lat >= topRightPoint.lat) {
            topRightPoint.lat = point.lat;
        }
        if (point.lon >= topRightPoint.lon) {
            topRightPoint.lon = point.lon;
        }
        if (point.lat <= bottomLeftPoint.lat) {
            bottomLeftPoint.lat = point.lat;
        }
        if (point.lon <= bottomLeftPoint.lon) {
            bottomLeftPoint.lon = point.lon;
        }
    });

    return {topRight: topRightPoint, bottomLeft: bottomLeftPoint};
}

function linkPOIsNearTrack(points, pois) {
    pois.forEach(poi => {
        let nearestPoint;
        let nearestDistance = Number.MAX_VALUE;

        points.forEach(point => {
            let distance = distanceBetweenPoints(point.lat, point.lon, poi.lat, poi.lon);
            if (distance < 0.5 && distance < nearestDistance) {
                nearestPoint = point;
                nearestDistance = distance;
            }
        });
        if (nearestPoint) {
            nearestPoint.poi = poi;
        }
    });
}

//distance between point in KM -> https://stackoverflow.com/questions/18883601/function-to-calculate-distance-between-two-coordinates
function distanceBetweenPoints(lat1, lon1, lat2, lon2) {
    let R = 6371; // km
    let dLat = toRad(lat2 - lat1);
    let dLon = toRad(lon2 - lon1);
    var lat1 = toRad(lat1);
    var lat2 = toRad(lat2);

    let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    let d = R * c;
    return d;
}

function toRad(Value) {
    return Value * Math.PI / 180;
}

function generateSchemeForGpx(name) {
    return new Promise((resolve, reject) => {
        fs.readFile('gpx/' + name + '.gpx', 'utf8', function (err, data) {
            if (err) {
                reject(err);
            } else {
                let root = parser.getTraversalObj(data, {ignoreAttributes: false});
                let parsedGpx = parseGPX(root);
                let bounds = findBounds(parsedGpx.trackPoints);
                fetchOSMData(bounds).then(osmPOIs => {
                    linkPOIsNearTrack(parsedGpx.trackPoints, osmPOIs);
                    let scheme = generateGraphDBScheme(parsedGpx);
                    resolve(scheme);
                });
            }
        });
    });
}

const client = new SparqlClient({endpointUrl: 'http://localhost:7200/repositories/TWS-GPX'});

app.listen(port, () => {
});

app.get('/generate', function (req, res) {
    let gpxFiles = ['4sDDFdd4cjA', 'btSeByOExEc', 'kmrcRbHcMpg', 'PO21QxqG2co', 'pRAjjKqHwzQ', 'rx1-4gf5lts', 'tIRn_qJSB5s', 'UAQjXL9WRKY'];
    let promises = [];
    gpxFiles.forEach(file => {
        promises.push(generateSchemeForGpx(file));
    });
    Promise.all(promises).then(gpxSchemes => {
        let globalScheme = gpxSchemes.reduce((a, b) => a + '\n' + b, '');
        fs.writeFile('scheme.ttl', globalScheme, function (err) {
            if (err) throw err;
            console.log('Saved!');
            res.json('Generation done');
        });
    });
});

app.get('/tracks', function (req, res) {
    const query = "PREFIX : <http://cui.unige.ch/>\n" +
        "select * where { \n" +
        "\t?track a :Track.\n" +
        "    ?track :name ?name.\n" +
        "} limit 100 \n";
    client.query.select(query).then(stream => {
        let rows = [];
        stream.on('data', row => {
            rows.push(row);
        })

        stream.on('finish', row => {
            let formattedResults = rows.map((row) => {
                return {name: row.name.value, id: row.track.value.replace('http://cui.unige.ch/', '')}
            });
            res.json(formattedResults);
        })

        stream.on('error', err => {
            console.error(err);
        })
    })
});

app.get('/tracks/:id', function (req, res) {
    const query = "PREFIX : <http://cui.unige.ch/>\n" +
        "SELECT * WHERE { \n" +
        "    ?track a :Track.\n" +
        "    ?track :trackpoints ?trackpoints.\n" +
        "    ?trackpoints :lat ?lat.\n" +
        "    ?trackpoints :lon ?lon.\n" +
        "    ?trackpoints :time ?time.\n" +
        "    OPTIONAL {\n" +
        "    \t?trackpoints :hasWaypoint ?waypoint.\n" +
        "        ?waypoint :name ?waypointName.  \n" +
        "    }\n" +
        "    OPTIONAL {\n" +
        "        ?trackpoints :hasClosePOI ?poi.\n" +
        "        ?poi :name ?poiName. \n" +
        "        ?poi :type ?poiType. \n" +
        "    }\n" +
        "    FILTER(regex(str(?track), \"" + req.params.id + "\" ) )\n" +
        "} \n" +
        "ORDER BY DESC(?time)\n" +
        "LIMIT 1000 ";

    client.query.select(query).then(stream => {
        let rows = [];
        stream.on('data', row => {
            rows.push(row);
        })

        stream.on('finish', row => {
            let formattedResults = rows.map((row) => {
                let poiName = null;
                let poiType = null;
                let waypointName = null;

                if (row.waypoint) {
                    waypointName = row.waypointName.value;
                }
                if (row.poi) {
                    poiName = row.poiName.value;
                    poiType = row.poiType.value;
                }
                return {
                    lat: row.lat.value,
                    lon: row.lon.value,
                    waypointName: waypointName,
                    poiName: poiName,
                    poiType: poiType
                }
            });
            res.json(formattedResults);
        })

        stream.on('error', err => {
            console.error(err);
        })
    })
});

app.get('/tracks/:id/dbpedia', function (req, res) {
    const query = "PREFIX : <http://cui.unige.ch/>\n" +
        "SELECT * WHERE { \n" +
        "    ?track a :Track.\n" +
        "    ?track :trackpoints ?trackpoints.\n" +
        "    ?trackpoints :lat ?lat.\n" +
        "    ?trackpoints :lon ?lon.\n" +
        "    ?trackpoints :time ?time.\n" +
        "    OPTIONAL {\n" +
        "    \t?trackpoints :hasWaypoint ?waypoint.\n" +
        "        ?waypoint :name ?waypointName.  \n" +
        "    }\n" +
        "    OPTIONAL {\n" +
        "        ?trackpoints :hasClosePOI ?poi.\n" +
        "        ?poi :name ?poiName. \n" +
        "        ?poi :type ?poiType. \n" +
        "    }\n" +
        "    FILTER(regex(str(?track), \"" + req.params.id + "\" ) )\n" +
        "} \n" +
        "ORDER BY DESC(?time)\n" +
        "LIMIT 1000 ";

    client.query.select(query).then(stream => {
        let rows = [];
        stream.on('data', row => {
            rows.push(row);
        })

        stream.on('finish', row => {
            let formattedResults = rows.map((row) => {
                return {
                    lat: row.lat.value,
                    lon: row.lon.value,
                }
            });
            let bounds = findBounds(formattedResults);
            const query = "SELECT DISTINCT * WHERE { " +
                "?s geo:lat ?la . ?s geo:long ?lo .\n" +
                "?s foaf:name ?placeName.\n" +
                "?s dbo:abstract ?placeAbstract.\n" +
                "FILTER(?la>" + bounds.bottomLeft.lat + " AND ?la<" + bounds.topRight.lat + " AND ?lo>" + bounds.bottomLeft.lon + " AND ?lo<" + bounds.topRight.lon + ") . } LIMIT 100";
            axios.get('http://dbpedia.org/sparql?default-graph-uri=http%3A%2F%2Fdbpedia.org&query=' + query).then((result) => {
                let places = [];
                for (let place of result.data.results.bindings) {
                    if (place.placeAbstract) {
                        if (place.placeAbstract["xml:lang"] == "fr") {
                            if (place.la && place.lo && place.placeName) {
                                places.push({
                                    name: place.placeName.value,
                                    lat: place.la.value,
                                    lon: place.lo.value,
                                    abstract: place.placeAbstract.value
                                });
                            }
                        }
                    }
                }
                res.json(places);
            });
        })

        stream.on('error', err => {
            console.error(err);
        })
    })
});
