const cds = require("@sap/cds");
const express = require("express");
const path = require("path");
const { attachmentUploadHandler } = require("./srv/lib/po-attachment-upload");

cds.on("bootstrap", (app) => {
  app.post(
    "/api/flowmate-ca/po-requests/:requestId/attachments",
    ...cds.middlewares.before,
    attachmentUploadHandler()
  );
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
