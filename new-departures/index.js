const mongodb = require('mongodb');
const axios = require('axios');
const departure_kind = "Nuevos";
//db connections
let cosmos_client = null;
let mongo_client = null;
const connection_cosmosDB = process.env["connection_cosmosDB"];
const connection_mongoDB = process.env["connection_mongoDB"];
const MONGO_DB_NAME = process.env['MONGO_DB_NAME'];

//URLS
const entries_departures = process.env["ENTRIES_DEPARTURES"];
const inventory = process.env["INVENTORY"];
const management_1 = process.env["MANAGEMENT_1"];

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
                try {
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

        async function getDepartures() {
            let query = {
                tipo_salida: departure_kind
            };
            await createCosmosClient();
            return new Promise(function (resolve, reject) {
                try {
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

    async function POST_departure() {
        //TODO: Get person data trough userid and save it in the entry data
        let departure; //Base object
        var userId = null;
        var destinationAgencyId = req.body['udn_destino_id'];
        var originSubsidiaryId = req.body['sucursal_origen_id'];
        var transportDriverId = req.body['operador_transporte_id'];
        var transportKindId = req.body['tipo_transporte_id']; //Non mandatory

        validate();

        try {
            let originSubsidiary = await searchSubsidiary(originSubsidiaryId);
            let destinationAgency = await searchAgency(destinationAgencyId);
            let transportDriver, transportKind;
            if (transportDriverId) {
                transportDriver = await searchTransportDriver(transportDriverId);
            }
            if (transportKindId) {
                transportKind = await searchTransportKind(transportKindId);
            }
            let fridges = await searchAllFridges(req.body['cabinets_id']);

            let precedentPromises = [originSubsidiary, destinationAgency, transportDriver, transportKind, fridges];

            Promise.all(precedentPromises)
                .then(async function () {
                    let date = new Date();
                    let date_string = date.toISOString();

                    // Create a departure base object.
                    departure = {
                        descripcion: req.body.descripcion,
                        fecha_hora: date_string,
                        tipo_salida: departure_kind,
                        nombre_chofer: req.body.nombre_chofer,
                        persona: null,
                        sucursal_origen: originSubsidiary,
                        udn_destino: destinationAgency,
                        tipo_transporte: transportKind,
                        operador_transporte: transportDriver,
                        cabinets: fridges
                    };

                    context.res = {
                        status: 200,
                        body: departure,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                    context.done();
                })
                .catch(function (error) {
                    context.res = error;
                    context.done();
                });

        }
        catch (error) {
            context.res = error;
            context.done();
        }

        //Internal functions
        function validate() {
            //Destination validation
            if (!destinationAgencyId) {
                //at least one
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-031'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }

            //Origin validation        
            if (!originSubsidiaryId) {
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-030'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }

            //Fridge array validation
            if (!req.body.cabinets_id) {
                //No array
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-003'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }
            if (req.body.cabinets_id.length === 0) {
                //Empty array
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-003'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }

            //Transport driver validation
            if (req.body.nombre_chofer && transportDriverId) {
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-047'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }
            if (!req.body.nombre_chofer && !transportDriverId) {
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-048'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }

        }

        async function searchAgency(agencyId) {
            await createMongoClient();
            return new Promise(function (resolve, reject) {
                try {
                    mongo_client
                        .db(MONGO_DB_NAME)
                        .collection('agencies')
                        .findOne({ _id: mongodb.ObjectId(agencyId) },
                            function (error, docs) {
                                if (error) {
                                    reject(error);
                                }
                                if (!docs) {
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-045'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                }
                                resolve(docs);
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
                    })
                }
            });
        }
        function searchAllFridges(fridgesId) {
            return new Promise(async function (resolve, reject) {
                var fridgesInfoPromises = [];
                while (fridgesId.length) {
                    fridgesInfoPromises.push(
                        searchFridge(
                            req.body['cabinets_id'].pop()
                        )
                    );
                }
                try {
                    let fridgesArray = await Promise.all(fridgesInfoPromises);
                    resolve(fridgesArray);
                }
                catch (error) {
                    reject(error);
                }
            });
        }
        async function searchFridge(fridgeInventoryNumber) {
            await createMongoClient();
            return new Promise(function (resolve, reject) {
                try {
                    mongo_client
                        .db(MONGO_DB_NAME)
                        .collection('fridges')
                        .findOne({ economico: fridgeInventoryNumber },
                            function (error, docs) {
                                if (error) {
                                    reject(error);
                                }
                                //Validations

                                if (!docs) {
                                    //Not found fridge
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-046'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                }
                                if (!docs.nuevo) {
                                    //Not new fridge
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-026'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                }
                                if (docs.estatus_unilever) {
                                    if (docs.estatus_unilever['code'] !== "0001") {
                                        //Not new fridge, improper unilever status
                                        reject({
                                            status: 400,
                                            body: {
                                                message: 'ES-007'
                                            },
                                            headers: {
                                                'Content-Type': 'application / json'
                                            }
                                        });
                                    }
                                }
                                if (!docs.sucursal) {
                                    //Not subsidiary
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-021'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                }
                                if (docs.sucursal['_id'].toString() !== originSubsidiaryId) {
                                    //Not from the same subsidiary
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-021'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                }
                                //Resolve correctly if all validations are passed        
                                resolve(docs);
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
                    })
                }
            });
        }
        async function searchSubsidiary(subsidiaryId) {
            await createMongoClient();
            return new Promise(function (resolve, reject) {
                try {
                    mongo_client
                        .db(MONGO_DB_NAME)
                        .collection('subsidiaries')
                        .findOne({ _id: mongodb.ObjectId(subsidiaryId) },
                            function (error, docs) {
                                if (error) {
                                    reject(error);
                                }
                                if (!docs) {
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-043'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                }
                                resolve(docs);
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
                    })
                }
            });
        }
        function searchTransportDriver(transportDriverId) {
            return new Promise(async function (resolve, reject) {
                try {
                    var transportDriver = await axios.get(entries_departures + '/api/transport-driver?id=' + transportDriverId);
                    //Validations
                    if (!transportDriver.data) {
                        reject({
                            status: 400,
                            body: {
                                message: 'ES-049'
                            },
                            headers: {
                                'Content-Type': 'application / json'
                            }
                        });
                    }
                    resolve(transportDriver.data);
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
            });
        }
        function searchTransportKind(transportKindId) {
            return new Promise(async function (resolve, reject) {
                try {
                    var transportKind = await axios.get(entries_departures + '/api/transport-kind?id=' + transportKindId);
                    //Validations
                    if (!transportKind.data) {
                        reject({
                            status: 400,
                            body: {
                                message: 'ES-050'
                            },
                            headers: {
                                'Content-Type': 'application / json'
                            }
                        });
                    }
                    resolve(transportKind.data);
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                }
            });

        }
        function deleteControl(controlId) {

        }
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

    function createMongoClient() {
        return new Promise(function (resolve, reject) {
            if (!mongo_client) {
                mongodb.MongoClient.connect(connection_mongoDB, function (error, _mongo_client) {
                    if (error) {
                        reject(error);
                    }
                    mongo_client = _mongo_client;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }

};