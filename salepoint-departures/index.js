const mongodb = require('mongodb');
//db connections
let mongo_client = null;
let cosmos_client = null;
const connection_mongoDB = process.env["connection_mongoDB"];
const connection_cosmosDB = process.env["connection_cosmosDB"];
const departure_kind = "Punto de venta";

module.exports = function (context, req) {
    switch (req.method) {
        case "GET":
            GET_departures();
            break;
        case "POST":
            POST_departure();
            break;
        default:
            notAllowed();
            break;
    }

    async function GET_departures() {
        var requestedID;
        if (req.query) {
            requestedID = req.query["id"];
        }
        try {
            if (requestedID) {
                //Specific departure requested
                let departure = await getDeparture(requestedID);
                context.res = {
                    body: departure,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                context.done();
            }
            else {
                //return all new fridge departures
                let departures = await getDepartures();
                context.res = {
                    body: departures,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                context.done();
            }
        }
        catch (e) {
            context.res = e;
            context.done();
        }

        //Internal functions
        async function getDeparture(id) {
            await createCosmosClient();
            return new Promise(function (resolve, reject) {
                try{
                cosmos_client
                    .db('EntriesDepartures')
                    .collection('Departures')
                    .findOne({ _id: mongodb.ObjectId(id) },
                        function (error, docs) {
                            if (error) {
                                reject({
                                    status: 500,
                                    body: error,
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
                }
                catch(error){
                    context.log(error);
                    reject({
                        status: 500,
                        body: error.toString(),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
            });

        }
        
        async function getDepartures() {
            let query = {
                tipo_salida: departure_kind
            };
            await createCosmosClient();
            return new Promise(function (resolve, reject) {
                try{
                cosmos_client
                    .db('EntriesDepartures')
                    .collection('Departures')
                    .find(query)
                    .toArray(function (error, docs) {
                        if (error) {
                            reject({
                                status: 500,
                                body: error,
                                headers: {
                                    "Content-Type": "application/json"
                                }
                            });
                        }
                        resolve(docs)
                    });
                }                
                catch(error){
                    context.log(error);
                    reject({
                        status: 500,
                        body: error.toString(),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
            });
        }

    }

    async function POST_departure() {

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

    async function createMongoClient() {
        if (!mongo_client) {
            mongodb.MongoClient.connect(connection_mongoDB, function (error, _mongo_client) {
                if (error) {
                    Promise.reject({
                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }
                    );
                }
                mongo_client = _mongo_client;
                Promise.resolve();
            });
        }
        else {
            return Promise.resolve();
        }
    }


};