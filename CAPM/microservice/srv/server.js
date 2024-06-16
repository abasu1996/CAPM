
const bodyParser = require("body-parser");
const express = require('express');
const app2 = express();
cds.on("bootstrap", async (app) => {
    app.use(bodyParser.json());
    app2.post('/odata/v4/say/upload',(req,res,next)=>{
        res.sendStatus("204");
    })
});

// Delegate bootstrapping to built-in server.js
//test commit
module.exports = cds.server;