const bodyParser = require("body-parser");
const express = require('express');
cds.on("bootstrap", async (app) => {
    app.use(bodyParser.json());
});


// Delegate bootstrapping to built-in server.js
module.exports = cds.server;