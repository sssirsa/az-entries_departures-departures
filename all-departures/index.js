const mongodb = require('mongodb');
//db connections
let entries_departures_client = null;
const connection_EntriesDepartures = process.env["connection_EntriesDepartures"];
const ENTRIES_DEPARTURES_DB_NAME = process.env['ENTRIES_DEPARTURES_DB_NAME'];

module.exports = function (context, req) {

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

    async function GET_departues() {
        var requestedID;
        var requestedKind;
        if (req.query) {
            requestedID = req.query["id"];
            requestedKind = req.query["tipo_salida"];
        }
        try {
            if (requestedID) {
                let departure = await getDeparture(requestedID);
                context.res = {
                    status: 200,
                    body: departure,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                context.done();
            }
            else {
                //Get departures list
                let departures = await getDepartures(requestedKind)
                context.res = {
                    body: departures,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                context.done();
            }
        }

        catch (error) {
            context.res = error;
            context.done();
        }
    }

    //Private functions
    function createEntriesDeparturesClient() {
        return new Promise(function (resolve, reject) {
            if (!entries_departures_client) {
                mongodb.MongoClient.connect(connection_EntriesDepartures, function (error, _entries_departures_client) {
                    if (error) {
                        reject(error);
                    }
                    entries_departures_client = _entries_departures_client;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }

    async function getDeparture(entryId) {
        await createEntriesDeparturesClient();
        return new Promise(function (resolve, reject) {
            entries_departures_client
                .db(ENTRIES_DEPARTURES_DB_NAME)
                .collection('Departures')
                .findOne({ _id: mongodb.ObjectId(entryId) },
                    function (error, docs) {
                        if (error) {
                            reject({
                                status: 500,
                                body: error.toString(),
                                headers: {
                                    "Content-Type": "application/json"
                                }
                            });
                        }
                        if (docs) {
                            resolve(docs);
                        }
                        else {
                            reject({
                                status: 404,
                                body: {},
                                headers: {
                                    "Content-Type": "application/json"
                                }
                            });
                        }
                    }
                );
        });
    }

    async function getDepartures(query) {
        await createEntriesDeparturesClient();
        return new Promise(function (resolve, reject) {
            entries_departures_client
                .db(ENTRIES_DEPARTURES_DB_NAME)
                .collection('Departures')
                .find({ tipo_salida: query })
                .toArray(function (error, docs) {
                    if (error) {
                        reject({
                            status: 500,
                            body: error.toString(),
                            headers: {
                                "Content-Type": "application/json"
                            }
                        });
                    }
                    resolve(docs)
                });
        });
    }

};