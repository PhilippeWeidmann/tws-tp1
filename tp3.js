const SparqlClient = require('sparql-http-client')
const client = new SparqlClient({
    endpointUrl: 'http://localhost:7200/repositories/Ski-Tp3',
    updateUrl: 'http://localhost:7200/repositories/Ski-Tp3/statements'
});

const prefix = "prefix : <http://www.semanticweb.org/tws/tp2#>\n" +
    "prefix owl: <http://www.w3.org/2002/07/owl#>\n" +
    "prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n" +
    "prefix xml: <http://www.w3.org/XML/1998/namespace>\n" +
    "prefix xsd: <http://www.w3.org/2001/XMLSchema#>\n" +
    "prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n"

console.log("Setting up difficulty")
setupDifficulty().then(() => {
    console.log("Done setting up difficulty")
    inferDurationRecursive()
    inferDifficultyRecursive()
    inferBelongsTo().then(() => {
        console.log("Done inferBelongsTo")
    })
    inferBelongsToPlace().then(() => {
        console.log("Done inferBelongsToPlace")
    })
    inferBelongsToRestaurant()
})

async function setupDifficulty() {
    const difficultyBlueRunQuery = prefix + "INSERT {?run :difficulty 1 .}\n" +
        "WHERE{?run a :BlueRun .}"
    await client.query.update(difficultyBlueRunQuery)
    const difficultyRedRunQuery = prefix + "INSERT {?run :difficulty 2 .}\n" +
        "WHERE{?run a :RedRun .}"
    await client.query.update(difficultyRedRunQuery)
    const difficultyBlackRunQuery = prefix + "INSERT {?run :difficulty 3 .}\n" +
        "WHERE{?run a :BlackRun .}"
    await client.query.update(difficultyBlackRunQuery)
    const difficultyLiftQuery = prefix + "INSERT {?run :difficulty 0 .}\n" +
        "WHERE{?run a :SkiLift .}"
    await client.query.update(difficultyLiftQuery)
}

/*
* Begin Infer Duration
 */

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
        const inferDurationQuery = prefix + "insert {?route :duration ?totalDuration.}\n" +
            "where {\n" +
            "    ?route a :Route. ?route :firstElement ?first. ?route :nextElement ?next. ?first :duration ?firstDuration. ?next :duration ?nextDuration\n" +
            "    bind(?firstDuration + ?nextDuration AS ?totalDuration)\n" +
            "}"
        return await client.query.update(inferDurationQuery);
    }

    async function getRouteDurationCount() {
        const routeDurationQuery = prefix + "select (COUNT(?duration) AS ?rowCount)\n" +
            "where { \n" +
            "    ?route a :Route.\n" +
            "    ?route :duration ?duration .\n" +
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
        const inferDifficultyQuery = prefix + "insert  {?x :difficulty ?dx.}\n" +
            "where {\n" +
            "    ?x a :Route.\n" +
            "    ?x :firstElement ?fx.\n" +
            "    ?x :nextElement ?rx.\n" +
            "    ?fx :difficulty ?dfx.\n" +
            "    ?rx :difficulty ?drx.\n" +
            "    bind(if(?dfx >= ?drx, ?dfx, ?drx) as ?dx)\n" +
            "}"
        return await client.query.update(inferDifficultyQuery);
    }

    async function getRouteDifficultyCount() {
        const routeDifficultyQuery = prefix + "select (COUNT(?o) AS ?rowCount)\n" +
            "where { \n" +
            "    ?s a :Route.\n" +
            "    ?s :difficulty ?o .\n" +
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
        const inferBelongsToRestQuery = prefix + "insert {?brx :belongsTo ?x.}\n" +
            "where {\n" +
            "    ?x a :Route. ?x :nextElement ?rx. ?brx :belongsTo ?rx.\n" +
            "}"
        return await client.query.update(inferBelongsToRestQuery);
    }

    async function inferBelongsToFirst() {
        const inferBelongsToFirstQuery = prefix + "insert {?fx :belongsTo ?x.}\n" +
            "where {\n" +
            "    ?x a :Route. ?x :firstElement ?fx.\n" +
            "}"
        return await client.query.update(inferBelongsToFirstQuery);
    }

    async function getBelongsToRestCount() {
        const belongsToRestQuery = prefix + "select (COUNT(?belonger) AS ?rowCount)\n" +
            "where { \n" +
            "    ?belonger :belongsTo ?route.\n" +
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

async function inferBelongsToPlace() {
    return new Promise((resolve, reject) => {
        inferBelongsTo().then(() => {
            inferBelongsToPlaceRequest().then(() => {
                resolve()
            })
        });
    });

    async function inferBelongsToPlaceRequest() {
        const inferBelongsToPlaceQuery = prefix + "insert {?p :belongsTo ?x.}\n" +
            "where {\n" +
            "    ?p a :Place. ?p (:isStartOf | :isEndOf) ?s. ?s :belongsTo ?x.\n" +
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

function inferBelongsToRestaurant() {
    inferBelongsToPlace().then(() => {
        insertBelongsToRestaurant().then(() => {
            console.log("Done inferBelongsToRestaurant")
        })
    });

    async function insertBelongsToRestaurant() {
        const inferBelongsToRestaurantQuery = prefix + "insert {?r :belongsTo ?x.}\n" +
            "where {\n" +
            "    ?r a :Restaurant. ?r :locatedAt ?p. ?p :belongsTo ?x.\n" +
            "}"
        return await client.query.update(inferBelongsToRestaurantQuery);
    }

}
/*
* End Infer Belongs To Restaurant
 */
