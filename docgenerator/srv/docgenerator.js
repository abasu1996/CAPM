const env = require("dot-env").config;
const cds = require("@sap/cds");
const { DocGenerator } = require("./docgeneratorclass");

const SapCfAxios = require("sap-cf-axios").default;
module.exports = class generateDocument extends cds.ApplicationService {
  init() {
    const destinationName = "ariba-api";
    //let restApi = cds.connect.to('restApi');

    this.on("generate", async (req) => {
      const axios = SapCfAxios(destinationName);
      console.log("On generate", process.env.apiKey, process.env.realm);

      let docResponse = await axios({
        method: "get",
        url: "/parameters",
        params: {
          includeMetadata: true,
          realm: process.env.realm,
          //"$filter": "isCustomerEditable eq true"
        },
        headers: {
          Accept: "application/json",
          apiKey: process.env.apiKey,
        },
      });

      try {
        console.log(typeof docResponse.data);
        var filterPayload = [];
        docResponse.data.forEach((item, index) => {
          if (item.defaultValue !== item.parameterValue) {
            filterPayload.push(item);
            filterPayload.sort(
              (a, b) => b.isCustomerEditable - a.isCustomerEditable
            );
          }
        });
        console.log(`Length of filterPayload: ${docResponse.data.length}`);
        console.log(`Length of filterPayload: ${filterPayload.length}`);
      } catch (err) {
        console.error("Failed to generate doc:", err);
      }

      return filterPayload;
    });

    this.on("helper", async (req) => {
      const axios = SapCfAxios(destinationName);
      console.log("On getDocumentCreated", req.req.data);

      let docResponse = await axios({
        method: "get",
        url: "/parameters",
        params: {
          includeMetadata: true,
          realm: process.env.realm,
          //"$filter": "isCustomerEditable eq true"
        },
        headers: {
          Accept: "application/json",
          apiKey: process.env.apiKey,
        },
      });

      return `Document created with ${docResponse.data.length} parameters`;
    });

    this.on("getDocumentCreated", async (req) => {
      const axios = SapCfAxios(destinationName);
      var buffer = null;
      var parameterName = JSON.parse(req.data.params).parameterName[0];
      if (parameterName.length === 1 ) {
        parameterName = [];
      }

      console.log("On helper", JSON.parse(req.data.params));
      let buildingQueries = `isCustomerEditable eq ${
        JSON.parse(req.data.params).isCustomerEditable
      } and (parameterName eq '${parameterName.replace(
        /,/g,
        "' or parameterName eq '"
      )}' )`;
      console.log(`Building queries: ${buildingQueries}`);

      let docResponse = await axios({
        method: "get",
        url: "/parameters",
        params: {
          includeMetadata: true,
          realm: process.env.realm,
          $filter: buildingQueries ? buildingQueries : "",
        },
        headers: {
          Accept: "application/json",
          apiKey: process.env.apiKey,
        },
      });
      try {
        console.log(typeof docResponse.data);
        var filterPayload = [];
        docResponse.data.forEach((item, index) => {
          if (item.defaultValue !== item.parameterValue) {
            filterPayload.push(item);
            filterPayload.sort(
              (a, b) => b.isCustomerEditable - a.isCustomerEditable
            );
          }
        });
        console.log(`Length of filterPayload: ${docResponse.data.length}`);
        console.log(`Length of filterPayload: ${filterPayload.length}`);

        const gen = new DocGenerator(filterPayload, {
          creator: "Doc Generator",
        });

        const out = await gen.generateCombined(
          "Audit-AutoReject-EmailApprovals.docx"
        );

        buffer = out;
        
        console.log("File Type:", typeof buffer);
        //console.error("Failed to generate doc:", req._);
        
        // for testing purpose
        /*
        const fs = require("fs");
        const filename = `output-files/Document-${Date.now()}.docx`;
        fs.writeFileSync(filename, out);
        console.log(`Document created successfully: ${filename}`);
        */

        //console.log(`Saved ${out}`);
      } catch (err) {
        console.error("Failed to generate doc:", err);
      }
      const filename = `Ariba - Config - Document-${Date.now()}.docx`;
      req._.res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      // Provide both filename (legacy) and filename* (RFC5987, UTF-8)
      req._.res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      req._.res.setHeader('Content-Length', buffer.length);
      req._.res.status(200).send(buffer);
    });

    return super.init();
  }
};
