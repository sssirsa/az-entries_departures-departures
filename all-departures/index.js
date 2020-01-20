const mongodb = require('mongodb');
//db connections
let cosmos_client = null;
const connection_cosmosDB = process.env["connection_cosmosDB"];

module.exports = async function (context, req) {

    switch (req.method) {
        case "GET":
            GET_departues();
            break;
        default:
            notAllowed();
            break;
    }

    function notAllowed() {
        context.res = {
            status: 405,
            body: "Method not allowed",
            headers: {
                'Content-Type': 'application/json'
            }
        };
        context.done();
    }

    function GET_departues() {
        var requestedID;
        var requestedKind;
        if (req.query) {
            requestedID = req.query["id"];
            requestedKind = req.query["tipo_salida"];
        }
        if (requestedID) {
            //Get specific entry
            createCosmosClient()
                .then(function () {
                    getDeparture(requestedID)
                        .then(function (departure) {
                            context.res = {
                                status: 200,
                                body: departure,
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            };
                            context.done();
                        })
                        .catch(function (error) {
                            context.log('Error reading departure from database');
                            context.log(error);
                            context.res = { status: 500, body: error };
                            context.done();
                        });

                })
                .catch(function (error) {
                    context.log('Error creating cosmos_client for departure detail');
                    context.log(error);
                    context.res = { status: 500, body: error };
                    context.done();

                });
        }
        else {
            //Get entries list
            createCosmosClient()
                .then(function () {
                    getDepartures(requestedKind)
                        .then(function (departuresList) {
                            context.res = {
                                body: departuresList,
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            };
                            context.done();
                        })
                        .catch(function (error) {
                            context.log('Error departures list from database');
                            context.log(error);
                            context.res = { status: 500, body: error };
                            context.done();
                        });
                })
                .catch(function (error) {
                    context.log('Error creating cosmos_client for departures list');
                    context.log(error);
                    context.res = { status: 500, body: error };
                    context.done();
                });
        }
    }

    //Private functions
    function createCosmosClient() {
        return new Promise(function (resolve, reject) {
            if (!cosmos_client) {
                mongodb.MongoClient.connect(connection_cosmosDB, function (error, _cosmos_client) {
                    if (error) {
                        reject(error);
                    }
                    cosmos_client = _cosmos_client;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }

    function getDeparture(entryId) {
        return new Promise(function (resolve, reject) {
            cosmos_client
                .db('EntriesDepartures')
                .collection('Departures')
                .findOne({ _id: mongodb.ObjectId(entryId) },
                    function (error, docs) {
                        if (error) {
                            reject(error);
                        }
                        resolve(docs);
                    }
                );
        });
    }

    function getDepartures(query) {
        return new Promise(function (resolve, reject) {
            cosmos_client
                .db('EntriesDepartures')
                .collection('Departures')
                .find(query)
                .toArray(function (error, docs) {
                    if (error) {
                        reject(error);
                    }
                    resolve(docs)
                });
        });
    }

};