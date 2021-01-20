const SparqlClient = require('sparql-http-client')
const client = new SparqlClient({
    endpointUrl: 'http://localhost:7200/repositories/Ski-Tp3',
    updateUrl: 'http://localhost:7200/repositories/Ski-Tp3/statements'
});

const prefix = "prefix ex: <http://www.semanticweb.org/tws/tp2#>\n" +
    "prefix owl: <http://www.w3.org/2002/07/owl#>\n" +
    "prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n" +
    "prefix xml: <http://www.w3.org/XML/1998/namespace>\n" +
    "prefix xsd: <http://www.w3.org/2001/XMLSchema#>\n" +
    "prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n"

/*
* Begin Infer Duration
 */
inferDurationRecursive()

function inferDurationRecursive() {
    getRouteDurationCount().then(count => {
        let previousCount = count;
        inferDuration().then(() => {
            getRouteDurationCount().then(count => {
                if (count > previousCount) {
                    inferDurationRecursive()
                } else {
                    console.log("Done inferDuration")
                }
            })
        });
    });

    async function inferDuration() {
        const inferDurationQuery = prefix + "insert {?x ex:duration ?tt.}\n" +
            "where {\n" +
            "    ?x a ex:Route. ?x ex:hasFirstElement ?fx. ?x ex:hasRest ?rx. ?fx ex:duration ?dfx. ?rx ex:duration ?drx\n" +
            "    bind(?dfx + ?drx AS ?tt)\n" +
            "}"
        return await client.query.update(inferDurationQuery);
    }

    async function getRouteDurationCount() {
        const routeDurationQuery = prefix + "select (COUNT(?o) AS ?rowCount)\n" +
            "where { \n" +
            "    ?s a ex:Route.\n" +
            "    ?s ex:duration ?o .\n" +
            "} ";
        let stream = await client.query.select(routeDurationQuery);
        let rowCount = 0;
        stream.on('data', result => {
            rowCount = result.rowCount.value;
        })

        let promise = new Promise((resolve, reject) => {
            stream.on('finish', () => {
                resolve(rowCount)
            })
        });
        return await promise;
    }
}

/*
* End Infer Duration
 */

/*
* Begin Infer Difficulty
 */
inferDifficultyRecursive()

function inferDifficultyRecursive() {
    getRouteDifficultyCount().then(count => {
        let previousCount = count;
        inferDifficulty().then(() => {
            getRouteDifficultyCount().then(count => {
                if (count > previousCount) {
                    inferDifficultyRecursive()
                } else {
                    console.log("Done inferDifficulty")
                }
            })
        });
    });

    async function inferDifficulty() {
        const inferDifficultyQuery = prefix + "insert  {?x ex:difficulty ?dx.}\n" +
            "where {\n" +
            "    ?x a ex:Route.\n" +
            "    ?x ex:hasFirstElement ?fx.\n" +
            "    ?x ex:hasRest ?rx.\n" +
            "    ?fx ex:difficulty ?dfx.\n" +
            "    ?rx ex:difficulty ?drx.\n" +
            "    bind(if(?dfx >= ?drx, ?dfx, ?drx) as ?dx)\n" +
            "}"
        return await client.query.update(inferDifficultyQuery);
    }

    async function getRouteDifficultyCount() {
        const routeDifficultyQuery = prefix + "select (COUNT(?o) AS ?rowCount)\n" +
            "where { \n" +
            "    ?s a ex:Route.\n" +
            "    ?s ex:difficulty ?o .\n" +
            "} ";
        let stream = await client.query.select(routeDifficultyQuery);
        let rowCount = 0;
        stream.on('data', result => {
            rowCount = result.rowCount.value;
        })

        let promise = new Promise((resolve, reject) => {
            stream.on('finish', () => {
                resolve(rowCount)
            })
        });
        return await promise;
    }
}

/*
* End Infer Difficulty
 */

/*
* Begin Infer Belongs To
 */
inferBelongsTo().then(() => {
    console.log("Done inferBelongsTo")
})

async function inferBelongsTo() {
    return new Promise((resolve, reject) => {
        inferBelongsToFirst().then(() => {
            recBelongsTo()

            function recBelongsTo() {
                getBelongsToRestCount().then(count => {
                    let previousCount = count;
                    inferBelongsToRest().then(() => {
                        getBelongsToRestCount().then(count => {
                            if (count > previousCount) {
                                recBelongsTo()
                            } else {
                                resolve()
                            }
                        })
                    });
                })
            }
        })
    });

    async function inferBelongsToRest() {
        const inferBelongsToRestQuery = prefix + "insert {?brx ex:belongsTo ?x.}\n" +
            "where {\n" +
            "    ?x a ex:Route. ?x ex:hasRest ?rx. ?brx ex:belongsTo ?rx.\n" +
            "}"
        return await client.query.update(inferBelongsToRestQuery);
    }

    async function inferBelongsToFirst() {
        const inferBelongsToFirstQuery = prefix + "insert {?fx ex:belongsTo ?x.}\n" +
            "where {\n" +
            "    ?x a ex:Route. ?x ex:hasFirstElement ?fx.\n" +
            "}"
        return await client.query.update(inferBelongsToFirstQuery);
    }

    async function getBelongsToRestCount() {
        const belongsToRestQuery = prefix + "select (COUNT(?belonger) AS ?rowCount)\n" +
            "where { \n" +
            "    ?belonger ex:belongsTo ?route.\n" +
            "} ";
        let stream = await client.query.select(belongsToRestQuery);
        let rowCount = 0;
        stream.on('data', result => {
            rowCount = result.rowCount.value;
        })

        let promise = new Promise((resolve, reject) => {
            stream.on('finish', () => {
                resolve(rowCount)
            })
        });
        return await promise;
    }
}

/*
* End Infer Belongs To
 */

/*
* Begin Infer Belongs To Place
 */
inferBelongsToPlace().then(() => {
    console.log("Done inferBelongsToPlace")
})

async function inferBelongsToPlace() {
    return new Promise((resolve, reject) => {
        inferBelongsTo().then(() => {
            inferBelongsToPlaceRequest().then(() => {
                resolve()
            })
        });
    });

    async function inferBelongsToPlaceRequest() {
        const inferBelongsToPlaceQuery = prefix + "insert {?p ex:belongsTo ?x.}\n" +
            "where {\n" +
            "    ?p a ex:Place. ?p (ex:isStartOf | ex:isEndOf) ?s. ?s ex:belongsTo ?x.\n" +
            "}"
        return await client.query.update(inferBelongsToPlaceQuery);
    }
}

/*
* End Infer Belongs To Place
 */

/*
* Begin Infer Belongs To Restaurant
 */
inferBelongsToRestaurant()

function inferBelongsToRestaurant() {
    inferBelongsToPlace().then(() => {
        insertBelongsToRestaurant().then(() => {
            console.log("Done inferBelongsToRestaurant")
        })
    });

    async function insertBelongsToRestaurant() {
        const inferBelongsToRestaurantQuery = prefix + "insert {?r ex:belongsTo ?x.}\n" +
            "where {\n" +
            "    ?r a ex:Restaurant. ?r ex:locatedAt ?p. ?p ex:belongsTo ?x.\n" +
            "}"
        return await client.query.update(inferBelongsToRestaurantQuery);
    }

}
/*
* End Infer Belongs To Restaurant
 */
