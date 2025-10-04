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
        var oView = this.getView();
        var oTable = oView.byId("idDocTable");
        this.oModel = this.getOwnerComponent().getModel();
        oTable.setBusy(true);
        this._fallbackFetchAndBind();
        //this._bindTableToFunction();
        this.aFinalFilters = [];
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
        //get the filter parameters from multicombo boxes in the filterbar

        var oView = this.getView();
        var oTable = oView.byId("idDocTable");
        oTable.setBusy(true);
        var oSelectedParams = this.getView()
          .byId("parameterName")
          .getSelectedItems();
        var aParamKeys = oSelectedParams.map(function (item) {
          return item.getKey();
        });

        var oSelectedCustomerEdit = this.getView()
          .byId("isCustomerEditable")
          .getSelectedItems();
        var aCustomerEditKeys = oSelectedCustomerEdit.map(function (item) {
          if (item.getKey() === "true" || item.getKey() === 0) {
            return true;
          } else if (item.getKey() === "false" || item.getKey() === 1) {
            return false;
          }
          return item.getKey();
        });

        var sParamFilter = aParamKeys.length > 0 ? aParamKeys.join(",") : " ";
        var sCustomerEditFilter =
          aCustomerEditKeys.length === 1 ? aCustomerEditKeys[0] : " ";

        var params = {
          parameterName: sParamFilter,
          isCustomerEditable: sCustomerEditFilter,
        };

        // var sUrl =
        //   "/odata/v4/generate-document/getDocumentCreated?params=" +
        //   encodeURIComponent(JSON.stringify(params));

        // fetch(sUrl, {
        //   method: "GET",
        //   credentials: "same-origin",
        //   headers: {
        //     "Content-Type": "application/json",
        //   },
        // })
        var resp = await this.oModel.bindContext(
          "/generateDocument.getDocumentCreated(...)"
        );
        var invokeResult = await resp
          .setParameter("params", JSON.stringify(params))
          .invoke();

        // .then(function (res) {
        //

        const buff = resp.getBoundContext().getObject();
        console.log(buff);

        const blob = this._bufferDownload(buff)

        //const cd = invokeResult.response.headers.get("Content-Disposition") || "";
        let filename = "Ariba Config Document.docx";
        // const mUtf8 = cd.match(/filename\\*=?UTF-8''([^;\\n\\r]+)/i);
        // const mQuoted = cd.match(/filename=\"?([^\";]+)\"?/i);
        // if (mUtf8 && mUtf8[1]) filename = decodeURIComponent(mUtf8[1]);
        // else if (mQuoted && mQuoted[1]) filename = mQuoted[1];

        // const url = URL.createObjectURL(blob);
        // const a = document.createElement("a");
        // a.href = url;
        // a.download = filename;
        // document.body.appendChild(a);
        // a.click();
        // a.remove();
        // URL.revokeObjectURL(url);
        //})
        //.then(
        //  function (data) {
        // console.log("Document created: " + data);

        // MessageBox.success("Document created: ");
        // oTable.setBusy(false);
        // }.bind(this)
        // )
        //.catch(
        // function (err) {
        // MessageBox.error(err.message || "Failed to call create document");
        // oTable.setBusy(false);
        //  }.bind(this)
        // );
      },

      _bufferDownload: async function (
        payload,
        suggestedFilename = "Ariba.docx",
        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        {
          if (!payload || !payload.buffer) {
            throw new Error("No buffer found in payload");
          }

          const buf = payload.buffer;
          let uint8;

   
          if (buf instanceof ArrayBuffer) {
            uint8 = new Uint8Array(buf);
            console.log(uint8);
            
          }
         
          else if (ArrayBuffer.isView(buf)) {
            uint8 = new Uint8Array(buf.buffer || buf);
            console.log(uint8);
          }
       
          else if (buf && buf.type === "Buffer" && Array.isArray(buf.data)) {
            uint8 = new Uint8Array(buf.data);
            console.log(uint8);
          }
      
          else if (Array.isArray(buf)) {
            uint8 = new Uint8Array(buf);
            console.log(uint8);
          }
         
          else if (typeof buf === "string") {
   
            const base64 =
              buf.indexOf("base64,") >= 0 ? buf.split("base64,")[1] : buf;
            const binary = atob(base64);
            const len = binary.length;
            uint8 = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              uint8[i] = binary.charCodeAt(i);
            }
          }
     
          else if (
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
          a.remove();
          URL.revokeObjectURL(url);
        }
      },
    });
  }
);
