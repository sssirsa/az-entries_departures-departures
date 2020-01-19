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

    function GET_departues(){
        
    }
    
};