const env = require("dot-env").config;
const cds = require("@sap/cds");
const fs = require("fs");
const csv = require("csv-parser");
const { DocGenerator, TemplateDocgenerator } = require("./docgeneratorclass");

const SapCfAxios = require("sap-cf-axios").default;
module.exports = class generateDocument extends cds.ApplicationService {
  init() {
    const destinationName = "ariba-api";
    //let restApi = cds.connect.to('restApi');

    this.on("generate", async (req) => {
      const axios = SapCfAxios(destinationName);
      //var f1 = req.data;

      // JSON.parse(f1.parameters).forEach(element => {
      //   console.log(element);

      // });

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
      const payload = {
        projectName: "Ariba Integration for Contoso",
        customerName: "Contoso Ltd",
        projectIdentification: [
          { label: "Project Name", value: "Ariba Integration for Contoso" },
          { label: "Customer Name", value: "Contoso Ltd" },
          { label: "SAP Ariba Project Manager", value: "Alice Example" },
        ],
        revisionHistory: [
          {
            author: "Alice Example",
            version: "0.1",
            date: Date.now().toString(),
            status: "Draft",
            location: "repo/docs/FS_v0.1.docx",
          },
        ],
        businessProcessOverview:
          "This project covers integration between Contoso purchasing and SAP Ariba services...",
        functionalOverview:
          "High-level description of the solution components...",
        alternativesConsidered: "- Option A: ...\n- Option B: ...",
        businessBenefit: "Expected cost savings and automated ordering...",
        assumptions: "Customer provides X data; network access available.",
        relationshipToOtherDocumentation:
          "See Leading Practice Functional Design Document - Ref: LD-001",
        userStories: [
          {
            id: "US-001",
            title: "Create Purchase Order",
            description:
              "As a buyer, I want to create a PO from Contoso so that Ariba receives it.",
          },
        ],
        functionalDesign:
          "Detailed design of the RICEFWD objects, mapping, API calls...",
        constraints: [
          "No changes to S/4 master data",
          "Ariba API rate limits are 1000 calls/min",
        ],
        tasksBySapAriba: [
          {
            task: "Develop connector",
            description: "Build and test the Ariba connector.",
            dependency: "Customer test data",
          },
        ],
        tasksByCustomer: [],
        tasksByPartner: [],
      };
      // const gen = new TemplateDocgenerator();
      // const out = await gen.generate(payload, {
      //    creator: "Doc Generator",
      // });
      // const fs = require("fs");
      // const filename2 = `Ariba Doc From template.docx`;
      //   fs.writeFileSync(filename2, out);
      //   console.log(`Document created successfully: ${filename2}`);
      /******************Above Code for Debugging and Local testing */
      const axios = SapCfAxios(destinationName);
      var buffer = null;
      console.log("JSSS", JSON.parse(JSON.stringify(req.data.params)));

      var parameterName = JSON.parse(req.data.params).parameterName;
      // if (parameterName) {
      //   parameterName = [];
      // }

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
      req._.res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      // Provide both filename (legacy) and filename* (RFC5987, UTF-8)
      req._.res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
          filename
        )}`
      );
      req._.res.setHeader("Content-Length", buffer.length);
      console.log(buffer);

      req._.res.status(200).send(JSON.stringify({ buffer: buffer }));
    });

    this.on("combinedDocGenerate", async (req) => {
      console.log("On combinedDocGenerate", JSON.stringify(req.data));
      
      // Wrap CSV reading in a Promise to make it awaitable
      const csvArray = await new Promise((resolve, reject) => {
        const data = [];
        fs.createReadStream(
          "D:\\GitApps\\abasu1996\\CAPM\\CAPM\\docgenerator\\BrainBoxDSAPP-T_Guided Buying_parameters.csv"
        )
          .pipe(csv())
          .on("data", (row) => {
            data.push(row);
          })
          .on("end", () => {
            console.log("CSV file successfully processed", data.length);
            resolve(data);
          })
          .on("error", (error) => {
            console.error("Error reading CSV file:", error);
            reject(error);
          });
      });
      
      console.log("CSV Array Length", csvArray.length);
        
      const payload = {
        projectName: "Ariba Integration for Contoso",
        customerName: "Contoso Ltd",
        projectIdentification: [
          { label: "Project Name", value: "Ariba Integration for Contoso" },
          { label: "Customer Name", value: "Contoso Ltd" },
          { label: "SAP Ariba Project Manager", value: "Alice Example" },
        ],
        revisionHistory: [
          {
            author: "Alice Example",
            version: "0.1",
            date: Date.now().toString(),
            status: "Draft",
            location: "repo/docs/FS_v0.1.docx",
          },
        ],
        businessProcessOverview:
          "This project covers integration between Contoso purchasing and SAP Ariba services...",
        functionalOverview:
          "High-level description of the solution components...",
        alternativesConsidered: "- Option A: ...\n- Option B: ...",
        businessBenefit: "Expected cost savings and automated ordering...",
        assumptions: "Customer provides X data; network access available.",
        relationshipToOtherDocumentation:
          "See Leading Practice Functional Design Document - Ref: LD-001",
        userStories: [
          {
            id: "US-001",
            title: "Create Purchase Order",
            description:
              "As a buyer, I want to create a PO from Contoso so that Ariba receives it.",
          },
        ],
        functionalDesign:
          "Detailed design of the RICEFWD objects, mapping, API calls...",
        constraints: [
          "No changes to S/4 master data",
          "Ariba API rate limits are 1000 calls/min",
        ],
        tasksBySapAriba: [
          {
            task: "Develop connector",
            description: "Build and test the Ariba connector.",
            dependency: "Customer test data",
          },
        ],
        guidedBuyingParameters: csvArray,
        tasksByCustomer: [],
        tasksByPartner: [],
      };
      const realPayload = req.data;
      realPayload.docpayload.csvGuidedBuyingParameters = csvArray;
      console.log("Real Payload", typeof realPayload);


            const gen = new TemplateDocgenerator();
            const out = await gen.generate(realPayload, {
               creator: "Doc Generator",
            });
            
            const filename2 = `Ariba Doc From template.docx`;
              fs.writeFileSync(filename2, out);
              console.log(`Document created successfully: ${filename2}`);
      // /******************Above Code for Debugging and Local testing */
      //       const axios = SapCfAxios(destinationName);
      //       var buffer = null;
      //       console.log("JSSS", JSON.parse(JSON.stringify(req.data.params)));

      //       var parameterName = JSON.parse(req.data.params).parameterName;
      //       // if (parameterName) {
      //       //   parameterName = [];
      //       // }

      //       console.log("On helper", JSON.parse(req.data.params));
      //       let buildingQueries = `isCustomerEditable eq ${
      //         JSON.parse(req.data.params).isCustomerEditable
      //       } and (parameterName eq '${parameterName.replace(
      //         /,/g,
      //         "' or parameterName eq '"
      //       )}' )`;
      //       console.log(`Building queries: ${buildingQueries}`);

      //       let docResponse = await axios({
      //         method: "get",
      //         url: "/parameters",
      //         params: {
      //           includeMetadata: true,
      //           realm: process.env.realm,
      //           $filter: buildingQueries ? buildingQueries : "",
      //         },
      //         headers: {
      //           Accept: "application/json",
      //           apiKey: process.env.apiKey,
      //         },
      //       });
      //       try {
      //         console.log(typeof docResponse.data);
      //         var filterPayload = [];
      //         docResponse.data.forEach((item, index) => {
      //           if (item.defaultValue !== item.parameterValue) {
      //             filterPayload.push(item);
      //             filterPayload.sort(
      //               (a, b) => b.isCustomerEditable - a.isCustomerEditable
      //             );
      //           }
      //         });
      //         console.log(`Length of filterPayload: ${docResponse.data.length}`);
      //         console.log(`Length of filterPayload: ${filterPayload.length}`);

      //         const gen = new DocGenerator(filterPayload, {
      //           creator: "Doc Generator",
      //         });

      //         const out = await gen.generateCombined(
      //           "Audit-AutoReject-EmailApprovals.docx"
      //         );

      //         buffer = out;

      //         console.log("File Type:", typeof buffer);
      //         //console.error("Failed to generate doc:", req._);

      //         // for testing purpose
      //         /*
      //         const fs = require("fs");
      //         const filename = `output-files/Document-${Date.now()}.docx`;
      //         fs.writeFileSync(filename, out);
      //         console.log(`Document created successfully: ${filename}`);
      //         */

      //         //console.log(`Saved ${out}`);
      //       } catch (err) {
      //         console.error("Failed to generate doc:", err);
      //       }
      //       const filename = `Ariba - Config - Document-${Date.now()}.docx`;
      //       req._.res.setHeader(
      //         "Content-Type",
      //         "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      //       );
      //       // Provide both filename (legacy) and filename* (RFC5987, UTF-8)
      //       req._.res.setHeader(
      //         "Content-Disposition",
      //         `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
      //           filename
      //         )}`
      //       );
      //       req._.res.setHeader("Content-Length", buffer.length);
      //       console.log(buffer);

      //       req._.res.status(200).send(JSON.stringify({ buffer: buffer }));

      return realPayload;
    });

    return super.init();
  }
};
