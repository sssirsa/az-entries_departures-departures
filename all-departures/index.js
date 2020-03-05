const mongodb = require('mongodb');
//db connections
let entries_departures_client = null;
const connection_EntriesDepartures = process.env["connection_EntriesDepartures"];
const ENTRIES_DEPARTURES_DB_NAME = process.env['ENTRIES_DEPARTURES_DB_NAME'];

module.exports = function (context, req) {

    switch (req.method) {
        case "GET":
            GET_departures();
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

    async function GET_departures() {
        var requestedID;
        var query;
        if (req.query) {
            requestedID = req.query["id"];
            if (req.query["tipo_salida"]) {
                if (!query) {
                    query = {};
                }
                query["tipo_salida"] = req.query["tipo_salida"];
            }
            if (req.query["economico"]) {
                if (!query) {
                    query = {};
                }
                query["cabinets.economico"] = req.query["economico"];
            }
            if (req.query['fecha_inicio'] || req.query['fecha_fin']) {
                if (!query) {
                    query = {};
                }
                var fecha_hora;
                if (req.query['fecha_inicio']) {
                    if (!fecha_hora) {
                        fecha_hora = {};
                    }
                    fecha_hora['$gte'] = new Date(new Date(req.query['fecha_inicio']).setHours(00, 00, 00));
                }
                if (req.query['fecha_fin']) {
                    if (!fecha_hora) {
                        fecha_hora = {};
                    }
                    fecha_hora['$lte'] = new Date(new Date(req.query['fecha_fin']).setHours(23, 59, 59));
                }
                query['fecha_hora'] = fecha_hora;
            }            
            if (req.query['sucursal']) {
                if (!query) {
                    query = {};
                }
                query['sucursal_origen._id'] = mongodb.ObjectId(req.query['sucursal']);
            }            
            if (req.query['udn']) {
                if (!query) {
                    query = {};
                }
                query['udn_origen._id'] = mongodb.ObjectId(req.query['udn']);
            }
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
                let departures = await getDepartures(query);
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
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                try {
                    entries_departures_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
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
                catch (error) {
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

        async function getDepartures(query) {
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                try {
                    entries_departures_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
                        .collection('Departures')
                        .find(query)
                        .sort({ fecha_hora: -1 })
                        .toArray(function (error, docs) 
                        {
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
                catch (error) {
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

    //Private functions
    function createEntriesDeparturesClient() {
        return new Promise(function (resolve, reject) {
            if (!entries_departures_client) {
                mongodb.MongoClient.connect(connection_EntriesDepartures, function (error, _entries_departures_client) {
                    if (error) {
                        reject({
                                status: 500,
                                body: error,
                                headers: {
                                    "Content-Type": "application/json"
                                }
                            });
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

};