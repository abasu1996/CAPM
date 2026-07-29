const cds = require("@sap/cds");
const express = require("express");
const path = require("path");

cds.on("bootstrap", (app) => {
  app.use("/flowmateca/webapp/odata", (req, res) => {
    res.redirect(307, `/odata${req.url}`);
  });
  app.use(
    "/flowmateca/webapp",
    express.static(path.join(__dirname, "app", "flowmateca", "webapp"), {
      etag: false,
      maxAge: 0
    })
  );
});

module.exports = cds.server;
