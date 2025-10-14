sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/ColumnListItem",
    "sap/m/ObjectIdentifier",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/m/FormattedText",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
  ],
  function (
    Controller,
    JSONModel,
    ColumnListItem,
    ObjectIdentifier,
    Text,
    VBox,
    FormattedText,
    MessageBox,
    Fragment,
    MessageToast
  ) {
    "use strict";

    return Controller.extend("docgenerator.controller.PrimaryView", {
      onInit: function () {
        this.oView = this.getView();
        //this.oTable = this.oView.byId("idDocTable");
        this.oModel = this.getOwnerComponent().getModel();
        // oTable.setBusy(true);
        //this._fallbackFetchAndBind();
        //this._bindTableToFunction();
        this.aFinalFilters = [];
      },
      onFileUpload: function (oEvent) {
        var file = oEvent;
      },
      onLoadCsvHeaders: function () {
        debugger;
        var oFileUploader = this.getView().byId("csvUploader");
        var domRef = oFileUploader.oFileUpload;
        var file = domRef.files[0];
        if (file) {
          var reader = new FileReader();
          reader.onload = function (e) {
            var content = e.target.result;
            var lines = content.split("\n");
            if (lines.length > 0) {
              var headers = lines[0].split(",");
              var csvHeaders = headers.map(function (header) {
                return { key: header.trim(), text: header.trim() };
              });
              var oFileModel = new sap.ui.model.json.JSONModel({
                csvHeaders: csvHeaders,
              });
              this.getView().setModel(oFileModel, "csv");
              console.log(csvHeaders);

              MessageToast.show("CSV headers loaded successfully.");
            }
          }.bind(this);
          reader.onerror = function (e) {
            MessageBox.error("Error reading file: " + e.target.error.message);
          };
        }
      },
      //Button Actions
      onTaxConfigPress: function () {
        if (!this._oTaxConfigDialog) {
          this._oTaxConfigDialog = sap.ui.xmlfragment(
            "docgenerator.fragments.TaxConfig",
            this
          );
          this.getView().addDependent(this._oTaxConfigDialog);
        }
        this._oTaxConfigDialog.open();
      },
      onGuidedBuyingPress: function () {
        var sFragment = "docgenerator.fragments.guidedBuying"; // adjust namespace
        if (!this._pGuidedBuyingDialog) {
          this._pGuidedBuyingDialog = Fragment.load({
            name: sFragment,
            controller: this,
          })
            .then(
              function (oDialog) {
                this.getView().addDependent(oDialog);
                return oDialog;
              }.bind(this)
            )
            .catch(
              function (err) {
                console.error("Dialog load error", err);
                this._pGuidedBuyingDialog = null;
              }.bind(this)
            );
        }

        this._pGuidedBuyingDialog.then(function (oDialog) {
          oDialog.open(); // Dialog opens centered
        });
      },

      onCloseFieldConfig: function () {
        var that = this;
        if (this._pGuidedBuyingDialog) {
          this._pGuidedBuyingDialog.then(function (oDialog) {
            oDialog.close();
          });
        }
      },

      onFieldConfigPress: function (oEvent) {
        var oView = this.getView();
        var that = this;
        if (!that._pFieldConfigDialog) {
          that._pFieldConfigDialog = Fragment.load({
            name: "docgenerator.fragments.FieldConfig",
            id: oView.getId(),
            controller: this,
          })
            .then(function (oDialog) {
              oView.addDependent(oDialog);
              return oDialog;
            })
            .catch(
              function (oErr) {
                console.error("FieldConfig fragment load error:", oErr);
                MessageToast.show(
                  "Unable to open Field Configuration (see console)."
                );

                this._pFieldConfigDialog = null;
                throw oErr;
              }.bind(this)
            );
        }
        that._pFieldConfigDialog
          .then(function (oDialog) {
            oDialog.open();
          })
          .catch(function () {});
      },

      _bindTableToFunction: async function () {
        var oView = this.getView();
        var oTable = oView.byId("idDocTable");
        var oModel = this.getOwnerComponent().getModel(); // default OData V4 model

        if (!oTable || !oModel) {
          MessageBox.error("Table or OData V4 model not found.");
          return;
        }

        var sPath = "/generate";

        var oTemplate = new ColumnListItem({
          cells: [
            new ObjectIdentifier({
              title: "{displayName}",
              text: "{parameterName}",
            }),
            new VBox({
              items: [
                new Text({ text: "{parameterType}" }),
                new Text({
                  text: {
                    parts: [{ path: "defaultValue" }],
                    formatter: function (v) {
                      return "Default: " + v;
                    },
                  },
                }),
                new Text({
                  text: {
                    parts: [{ path: "parameterValue" }],
                    formatter: function (v) {
                      return "Value: " + v;
                    },
                  },
                }),
                new Text({
                  text: {
                    parts: [{ path: "isDefault" }],
                    formatter: function (v) {
                      return v ? "Is Default: true" : "";
                    },
                  },
                }),
                new FormattedText({ htmlText: "{description}" }),
              ],
            }),
          ],
        });

        // Unbind previous binding and create a deferred binding to the OData operation

        var resp = await oModel.bindContext("/generateDocument.generate(...)");
        // let docResp = resp
        //   .invoke()
        //   .then(function (result) {
        //     // handle success
        //     console.log("success", result);
        //   })
        //   .catch(function (error) {
        //     // handle error
        //     console.error("error", error);
        //   });

        await resp.invoke();

        const result = resp.getBoundContext()?.getObject();
        console.log(result);

        oTable.bindContext().execute();
        oTable.bindItems({
          path: sPath,
          parameters: {
            operationMode: "Server", // optional
          },
          template: oTemplate,
        });

        // Attach change handler to the list binding to detect empty results
        var oBinding = oTable.getBinding("items");
        if (!oBinding) {
          // unexpected - fallback immediately
          this._fallbackFetchAndBind();
          return;
        }

        var fnOnChange = function () {
          try {
            var aContexts =
              typeof oBinding.getCurrentContexts === "function"
                ? oBinding.getCurrentContexts()
                : [];
            var iCount = aContexts && aContexts.length ? aContexts.length : 0;

            if (iCount === 0) {
              oBinding.detachChange(fnOnChange);
              this._fallbackFetchAndBind();
            } else {
              oBinding.detachChange(fnOnChange);
            }
          } catch (e) {
            // On any error, fallback
            oBinding.detachChange(fnOnChange);
            this._fallbackFetchAndBind();
          }
        }.bind(this);

        if (typeof oBinding.attachChange === "function") {
          oBinding.attachChange(fnOnChange);
        } else {
          setTimeout(
            function () {
              this._fallbackFetchAndBind();
            }.bind(this),
            800
          );
        }
      },
      onParamNameFilterSelectionFinish: function (oEvent) {
        var oMultiComboBox = oEvent.getSource();
        var aSelectedItems = oMultiComboBox.getSelectedItems();
        var aKeys = aSelectedItems.map(function (item) {
          return item.getKey();
        });
        var oTable = this.getView().byId("idDocTable");
        var oBinding = oTable.getBinding("items");

        if (oBinding) {
          if (aKeys.length > 0) {
            var aFilters = aKeys.map(function (key) {
              return new sap.ui.model.Filter(
                "parameterName",
                sap.ui.model.FilterOperator.EQ,
                key
              );
            });
            var oCombinedFilter = new sap.ui.model.Filter(aFilters, false); // false for OR logic
            oBinding.filter(oCombinedFilter);
          } else {
            // No selection, clear filter
            oBinding.filter([]);
          }
        }
      },
      onCustomerEditFilterSelectionFinish: function (oEvent) {
        var oMultiComboBox = oEvent.getSource();
        var aSelectedItems = oMultiComboBox.getSelectedItems();

        var aKeys = aSelectedItems.map(function (item) {
          if (item.getKey() === "true" || item.getKey() === 0) {
            return true;
          } else if (item.getKey() === "false" || item.getKey() === 1) {
            return false;
          }
          return item.getKey();
        });
        var oTable = this.getView().byId("idDocTable");
        var oBinding = oTable.getBinding("items");

        if (oBinding) {
          if (aKeys.length > 0) {
            var aFilters = aKeys.map(function (key) {
              return new sap.ui.model.Filter(
                "isCustomerEditable",
                sap.ui.model.FilterOperator.EQ,
                key
              );
              aFinalFilters.push(
                new sap.ui.model.Filter({ filters: aFilters })
              );
            });
            var oCombinedFilter = new sap.ui.model.Filter(aFilters, false); // false for OR logic
            oBinding.filter(oCombinedFilter);
          } else {
            // No selection, clear filter
            oBinding.filter([]);
          }
        }
      },
      _fallbackFetchAndBind: async function () {
        var oView = this.getView();
        var oTable = oView.byId("idDocTable");
        // oTable.setBusy(true);

        if (!oTable) {
          MessageBox.error("Table not found.");
          return;
        }

        var params =
          "isCustomerEditable eq true and (parameterName eq 'Application.Approvable.AllowApprovalOfDeniedApprovable' or parameterName eq 'Application.Approvable.AllowedForExternalApproval' )";
        var resp = await this.oModel.bindContext(
          "/generateDocument.generate(...)"
        );
        //resp.setParameter("parameters", JSON.stringify([{"name":"Anim","JobId":12345},{"name":"Basu","JobId":12348}]))
        resp
          .invoke()
          .then(
            async function (data) {
              const docData = resp.getBoundContext().getObject();

              var oDocModel = new JSONModel({ items: docData.value });
              oView.setModel(oDocModel, "docs");
              oTable.setBusy(false);
              var oDocsModel = this.getView().getModel("docs");
              var aDocs = oDocsModel.getProperty("/items") || [];

              var mSeen = {};
              var parameterNameSeen = {};
              var aOptions = aDocs.reduce(function (acc, oItem) {
                var v = oItem.isCustomerEditable;

                if (v !== undefined && !mSeen[v]) {
                  mSeen[v] = true;
                  acc.push({ key: v, text: String(v) });
                }
                return acc;
              }, []);

              var aParameterName = await aDocs.reduce(function (prm1, oItem) {
                var k = oItem.parameterName; // adjust property name if different
                if (k !== undefined && !parameterNameSeen[k]) {
                  parameterNameSeen[k] = true;
                  prm1.push({ key: k, text: String(k.replace(/\./g, " ")) });
                }
                return prm1;
              }, []);

              // set a small JSON model just for the filter options
              var oFilterModel = new sap.ui.model.json.JSONModel({
                customerEditableOptions: aOptions,
                parameterNameOptions: aParameterName,
              });
              this.getView().setModel(oFilterModel, "filter");
            }.bind(this)
          )
          .catch(
            function (err) {
              MessageBox.error(
                err.message || "Failed to call generate function"
              );
              // ensure table cleared
              var oDocModel = new JSONModel({ items: [] });

              oView.setModel(oDocModel, "docs");

              oTable.unbindItems();
              oTable.bindItems({
                path: "docs>/items",
                template: new ColumnListItem(),
              });
            }.bind(this)
          );
      },
      onGeneratePress: async function () {
        this.byId("page").setBusy(true);
        const payload = {
          value: {
            docpayload: {
              projectName: this.byId("inpProjectName").getValue(),
              customerName: this.byId("inpCustomerName").getValue(),
              projectIdentification: [
                {
                  label: "Project Name",
                  value: this.byId("inpProjectName").getValue(),
                },
                {
                  label: "Customer Name",
                  value: this.byId("inpCustomerName").getValue(),
                },
                {
                  label: "SAP Ariba Project Manager",
                  value: this.byId("inpAribaPM").getValue(),
                },
              ],
              revisionHistory: [
                {
                  author: this.byId("inpAribaPM").getValue(),
                  version: "0.1",
                  date: "2025-10-07T00:00:00Z",
                  status: "Draft",
                  location: "<Link to document>",
                },
              ],
              businessProcessOverview: `This Project ${
                this.byId("inpProjectName").getValue()
                  ? this.byId("inpProjectName").getValue()
                  : "<Project Name>"
              } covers configuration between ${
                this.byId("inpCustomerName").getValue()
                  ? this.byId("inpCustomerName").getValue()
                  : "<Customer Name>"
              }  and SAP Ariba services...`,
              functionalOverview: `High-level description of the solution components...`,
              alternativesConsidered: `- Option A: ...\n- Option B: ...`,
              businessBenefit: `Expected cost savings and automated ordering...`,
              assumptions: `Customer provides X data; network access available.`,
              relationshipToOtherDocumentation:
                "See Leading Practice Functional Design Document for core details.",
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
              csvGuidedBuyingParameters: [],
              sapEditableParameters: [],
              customerEditableParameters: [],
            },
          },
        };

        var actionPath = "/generateDocument.combinedDocGenerate(...)";
        var resp = await this.oModel.bindContext(actionPath);
        Object.entries(payload).forEach(([key, value]) => {
          resp.setParameter(key, value);
        });
        await resp.invoke();

        if (resp.getBoundContext().getObject()) {
          const buff = resp.getBoundContext().getObject();

          const blob = this._bufferDownload(buff);
          MessageToast.show("Document generated successfully.");
          this.byId("page").setBusy(false);
        } else {
          MessageBox.error("Document generation failed.");
          this.byId("page").setBusy(false);
        }

        let filename = "Ariba Config Document.docx";
      },

      _bufferDownload: async function (
        payload,
        suggestedFilename = "Project Functional Specification Document.docx",
        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        {
          if (!payload || !payload.buffer) {
            if (payload && payload.fileMessage) {
              MessageBox.information(payload.fileMessage);
              this.byId("page").setBusy(false);
              return;
            } else {
              throw new Error("No buffer found in payload");
            }
          }

          const buf = payload.buffer;
          let uint8;

          if (buf instanceof ArrayBuffer) {
            uint8 = new Uint8Array(buf);
            console.log(uint8);
          } else if (ArrayBuffer.isView(buf)) {
            uint8 = new Uint8Array(buf.buffer || buf);
            console.log(uint8);
          } else if (buf && buf.type === "Buffer" && Array.isArray(buf.data)) {
            uint8 = new Uint8Array(buf.data);
            console.log(uint8);
          } else if (Array.isArray(buf)) {
            uint8 = new Uint8Array(buf);
            console.log(uint8);
          } else if (typeof buf === "string") {
            const base64 =
              buf.indexOf("base64,") >= 0 ? buf.split("base64,")[1] : buf;
            const binary = atob(base64);
            const len = binary.length;
            uint8 = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              uint8[i] = binary.charCodeAt(i);
            }
          } else if (
            buf &&
            (buf.data instanceof ArrayBuffer ||
              Array.isArray(buf.data) ||
              ArrayBuffer.isView(buf.data))
          ) {
            const d = buf.data;
            if (d instanceof ArrayBuffer) uint8 = new Uint8Array(d);
            else if (ArrayBuffer.isView(d)) uint8 = new Uint8Array(d.buffer);
            else uint8 = new Uint8Array(d);
          } else {
            throw new Error(
              "Unsupported buffer format: " +
                Object.prototype.toString.call(buf)
            );
          }

          const blob = new Blob([uint8], { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = suggestedFilename;
          document.body.appendChild(a);
          a.click();
          this.byId("page").setBusy(false);
          a.remove();
          URL.revokeObjectURL(url);
        }
      },
    });
  }
);
