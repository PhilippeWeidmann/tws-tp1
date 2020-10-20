const parser = require('fast-xml-parser');
const fs = require('fs');
const {v4: uuid} = require('uuid');
const axios = require('axios').default;

const schemeHeader = "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n" +
    "@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.\n" +
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . \n\n" +
    "@prefix : <http://cui.unige.ch/> . \n\n"


console.log("TWS converter");

function parseGPX(gpxFile) {
    let trackPoints = gpxFile.child.gpx[0].child.trk[0];
    let trackName = trackPoints.child.name[0].val;
    let points = trackPoints.child.trkseg[0].child.trkpt;

    let parsedPoints = [];
    points.forEach(point => {
        let parsedPoint = {
            lat: Number(point.attrsMap["@_lat"]),
            lon: Number(point.attrsMap["@_lon"]),
            ele: point.child.ele[0].val
        };
        parsedPoints.push(parsedPoint);
    });

    return {name: trackName, trackPoints: parsedPoints};
}

function generateGraphDBPoint(point) {
    let pointId = ':swt-trkpt-' + uuid();
    let schemeString = pointId + ' a :trkpt . \n';
    schemeString += pointId + ' :lat ' + point.lat + ' .\n';
    schemeString += pointId + ' :lon ' + point.lon + ' .\n';
    schemeString += pointId + ' :ele ' + point.ele + ' .\n';

    return {id: pointId, value: schemeString};
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
    let schemeString = schemeHeader + pointsScheme + trackId + ' a :trk . \n';
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

fs.readFile('gpx/4sDDFdd4cjA.gpx', 'utf8', function (err, data) {
    if (err) {
        return console.log(err);
    }
    let root = parser.getTraversalObj(data, {ignoreAttributes: false});
    let parsedGpx = parseGPX(root);
    let bounds = findBounds(parsedGpx.trackPoints);
    fetchOSMData(bounds).then(result => {
        let scheme = generateGraphDBScheme(parsedGpx);
        fs.writeFile('gpx.ttl', scheme, function (err) {
            if (err) throw err;
            console.log('Saved!');
        });
        fs.writeFile('result.json', JSON.stringify(result), function (err) {
            if (err) throw err;
            console.log('Saved!');
        });

    });

});
