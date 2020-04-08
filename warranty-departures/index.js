const mongodb = require('mongodb');
const axios = require('axios');
const departure_kind = "Garantías";
//db connections
let entries_departures_client = null;
let management_client = null;
const connection_EntriesDepartures = process.env["connection_EntriesDepartures"];
const connection_Management = process.env["connection_Management"];
const ENTRIES_DEPARTURES_DB_NAME = process.env['ENTRIES_DEPARTURES_DB_NAME'];
const MANAGEMENT_DB_NAME = process.env['MANAGEMENT_DB_NAME'];

//URLS
const entries_departures = process.env["ENTRIES_DEPARTURES"];

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

        async function getDepartures() {
            let query = {
                tipo_salida: departure_kind
            };
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                try {
                    entries_departures_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
                        .collection('Departures')
                        .find(query)
                        .sort({ fecha_hora: -1 })
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
        var originAgencyId = req.body['udn_origen'];
        var destinationSubsidiaryId = req.body['sucursal_destino'];
        var transportDriverId = req.body['operador_transporte'];
        var transportKindId = req.body['tipo_transporte']; //Non mandatory

        validate();

        try {
            let destinationSubsidiary = await searchSubsidiary(destinationSubsidiaryId);
            let originAgency = await searchAgency(originAgencyId);
            let transportDriver, transportKind;
            if (transportDriverId) {
                transportDriver = await searchTransportDriver(transportDriverId);
            }
            if (transportKindId) {
                transportKind = await searchTransportKind(transportKindId);
            }
            let fridges = await searchAllFridges(req.body['cabinets']);

            let precedentPromises = [destinationSubsidiary, originAgency, transportDriver, transportKind, fridges];

            Promise.all(precedentPromises)
                .then(async function () {
                    let date = new Date();

                    // Create a departure base object.
                    departure = {
                        descripcion: req.body.descripcion,
                        fecha_hora: date,
                        tipo_salida: departure_kind,
                        nombre_chofer: req.body.nombre_chofer,
                        persona: null,
                        sucursal_destino: destinationSubsidiary,
                        udn_origen: originAgency,
                        tipo_transporte: transportKind,
                        operador_transporte: transportDriver,
                        cabinets: fridges
                    };

                    //await deleteAllControl(req.body['cabinets_id']);
                    await updateFridges(fridges);

                    let response = await writeDeparture();

                    context.res = {
                        status: 200,
                        body: response.ops[0],
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
            if (!destinationSubsidiaryId) {
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-013'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }

            //Origin validation        
            if (!originAgencyId) {
                context.res = {
                    status: 400,
                    body: {
                        message: 'ES-009'
                    },
                    headers: {
                        'Content-Type': 'application / json'
                    }
                };
                context.done();
            }

            //Fridge array validation
            if (!req.body.cabinets) {
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
            if (req.body.cabinets.length === 0) {
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
            await createManagementClient();
            return new Promise(function (resolve, reject) {
                try {
                    management_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('agencies')
                        .findOne({ _id: mongodb.ObjectId(agencyId) },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
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
            let fridgesIdArray = fridgesId.slice();
            return new Promise(async function (resolve, reject) {
                var fridgesInfoPromises = [];
                while (fridgesIdArray.length) {
                    fridgesInfoPromises.push(
                        searchFridge(
                            fridgesIdArray.pop()
                        )
                    );
                }
                try {
                    let fridgesArray = await Promise.all(fridgesInfoPromises);
                    resolve(fridgesArray);
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
        async function searchFridge(fridgeInventoryNumber) {
            await createManagementClient();
            return new Promise(function (resolve, reject) {
                try {
                    management_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('fridges')
                        .findOne({ economico: fridgeInventoryNumber },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
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
                                    return;
                                }
                                if (!docs.udn) {
                                    //Not subsidiary
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-022'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                if (docs.udn['_id'].toString() !== originAgencyId) {
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
                                    return;
                                }
                                let validUnileverStatuses = ["0001", "0003", "0007"];
                                if (docs.estatus_unilever) {
                                    if (!validUnileverStatuses.includes(docs.estatus_unilever['code'])) {
                                        //Improper unilever status
                                        reject({
                                            status: 400,
                                            body: {
                                                message: 'ES-028'
                                            },
                                            headers: {
                                                'Content-Type': 'application / json'
                                            }
                                        });
                                        return;
                                    }
                                }
                                if (docs.nuevo) {
                                    //Not new fridge
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'ES-059'
                                        },
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
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
            await createManagementClient();
            return new Promise(function (resolve, reject) {
                try {
                    management_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('subsidiaries')
                        .findOne({ _id: mongodb.ObjectId(subsidiaryId) },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
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
                        return;
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
                        return;
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
        async function searchUnileverStatus(code) {
            await createManagementClient();
            return new Promise(function (resolve, reject) {
                try {
                    management_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('unilevers')
                        .findOne({ code: code },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                if (!docs) {
                                    reject({
                                        status: 400,
                                        body: {
                                            message: 'MG-016'
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
        async function writeDeparture() {
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                try {
                    entries_departures_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
                        .collection('Departures')
                        .insertOne(departure, function (error, docs) {
                            if (error) {
                                reject({
                                    status: 500,
                                    body: error,
                                    headers: {
                                        'Content-Type': 'application / json'
                                    }
                                });
                                return;
                            }
                            resolve(docs);
                        });
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        async function deleteAllControl(fridgesId) {
            let fridgesIdArray = fridgesId.slice();
            return new Promise(async function (resolve, reject) {
                var fridgesControlPromises = [];
                while (fridgesIdArray.length) {
                    fridgesControlPromises.push(
                        deleteControl(
                            fridgesIdArray.pop()
                        )
                    );
                }
                try {
                    let fridgesArray = await Promise.all(fridgesControlPromises);
                    resolve(fridgesArray);
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        async function deleteControl(fridgeInventoryNumber) {
            await createEntriesDeparturesClient();
            return new Promise(function (resolve, reject) {
                try {
                    entries_departures_client
                        .db(ENTRIES_DEPARTURES_DB_NAME)
                        .collection('Control')
                        .findOne({ cabinet_id: fridgeInventoryNumber }, function (error, docs) {
                            if (error) {
                                reject({
                                    status: 500,
                                    body: error,
                                    headers: {
                                        'Content-Type': 'application / json'
                                    }
                                });
                                return;
                            }
                            if (!docs) {
                                reject({
                                    status: 500,
                                    body: 'No control registry found for the fridge ' + fridgeInventoryNumber,
                                    headers: {
                                        'Content-Type': 'application / json'
                                    }
                                });
                            }
                            if (docs) {
                                entries_departures_client
                                    .db(ENTRIES_DEPARTURES_DB_NAME)
                                    .collection('Control')
                                    .deleteOne({ _id: mongodb.ObjectId(docs['_id'].toString()) }, function (error) {
                                        if (error) {
                                            reject({
                                                status: 500,
                                                body: error,
                                                headers: {
                                                    'Content-Type': 'application / json'
                                                }
                                            });
                                            return;
                                        }
                                        resolve();
                                    });
                            }
                        });
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        async function updateFridges(fridges) {
            let fridgesArray = fridges.slice();
            let unlieverStatus = await searchUnileverStatus('0011');
            let newValues = {
                sucursal: null,
                udn: null,
                nuevo: false,
                estatus_unilever: unlieverStatus,
                fecha_ingreso: null
            };
            return new Promise(async function (resolve, reject) {
                var fridgesLocationPromises = [];
                while (fridgesArray.length) {
                    fridgesLocationPromises.push(
                        updateFridge(
                            newValues,
                            fridgesArray.pop()['_id']
                        )
                    );
                }
                try {
                    let updatedFridgesArray = await Promise.all(fridgesLocationPromises);
                    resolve(updatedFridgesArray);
                }
                catch (error) {
                    reject({
                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
        }
        async function updateFridge(newValues, fridgeId) {
            await createManagementClient();
            return new Promise(function (resolve, reject) {
                try {
                    management_client
                        .db(MANAGEMENT_DB_NAME)
                        .collection('fridges')
                        .updateOne(
                            { _id: mongodb.ObjectId(fridgeId) },
                            { $set: newValues },
                            function (error, docs) {
                                if (error) {
                                    reject({
                                        status: 500,
                                        body: error,
                                        headers: {
                                            'Content-Type': 'application / json'
                                        }
                                    });
                                    return;
                                }
                                resolve(docs);
                            }
                        );
                }
                catch (error) {
                    reject({

                        status: 500,
                        body: error,
                        headers: {
                            'Content-Type': 'application / json'
                        }
                    });
                }
            });
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

    function createManagementClient() {
        return new Promise(function (resolve, reject) {
            if (!management_client) {
                mongodb.MongoClient.connect(connection_Management, function (error, _management_client) {
                    if (error) {
                        reject({
                            status: 500,
                            body: error,
                            headers: {
                                "Content-Type": "application/json"
                            }
                        });
                    }
                    management_client = _management_client;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }

};