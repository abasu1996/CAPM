

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
  ],
  function (
    Controller,
    JSONModel,
    ColumnListItem,
    ObjectIdentifier,
    Text,
    VBox,
    FormattedText,
    MessageBox
  ) {
    "use strict";

    return Controller.extend("docgenerator.controller.PrimaryView", {
      onInit: function () {
        // initial bind attempt using deferred list binding to the function
        //this._bindTableToFunction();
        var oView = this.getView();
        var oTable = oView.byId("idDocTable");
        oTable.setBusy(true);
        this._fallbackFetchAndBind();
        this.aFinalFilters = [];
      },

      /**
       * Create a deferred list binding to the unbound function /generate.
       * If no rows are returned (binding empty), fallback to fetch+JSONModel.
       */
      _bindTableToFunction: function () {
        var oView = this.getView();
        var oTable = oView.byId("idDocTable");
        var oModel = this.getOwnerComponent().getModel(); // default OData V4 model

        if (!oTable || !oModel) {
          MessageBox.error("Table or OData V4 model not found.");
          return;
        }

        // Build the function path. If your function has params change this accordingly.
        // If no params, "/generate" or "/generate()" should be fine.
        var sPath = "/generate";

        // Create reusable template for rows (relative bindings)
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
        oTable.unbindItems();
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

        // On change, check if contexts are present. If empty, fallback to fetch.
        // getCurrentContexts() is available for OData V4 list bindings.
        var fnOnChange = function () {
          try {
            var aContexts =
              typeof oBinding.getCurrentContexts === "function"
                ? oBinding.getCurrentContexts()
                : [];
            var iCount = aContexts && aContexts.length ? aContexts.length : 0;

            if (iCount === 0) {
              // No rows returned by the OData list binding — try fallback
              // Detach handler to avoid repeated fallback attempts
              oBinding.detachChange(fnOnChange);
              this._fallbackFetchAndBind();
            } else {
              // Binding returned rows — you may perform additional UI updates here
              oBinding.detachChange(fnOnChange);
            }
          } catch (e) {
            // On any error, fallback
            oBinding.detachChange(fnOnChange);
            this._fallbackFetchAndBind();
          }
        }.bind(this);

        // Attach change event
        if (typeof oBinding.attachChange === "function") {
          oBinding.attachChange(fnOnChange);
        } else {
          // If attachChange not present, fallback after a small timeout
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
        if(item.getKey() === "true" || item.getKey() === 0){
          return true;
        } else if(item.getKey() === "false" || item.getKey() === 1){
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
            aFinalFilters.push(new sap.ui.model.Filter({filters:aFilters}))
          });
          var oCombinedFilter = new sap.ui.model.Filter(aFilters, false); // false for OR logic
          oBinding.filter(oCombinedFilter);
        } else {
          // No selection, clear filter
          //oBinding.filter([]);
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

        // Simple fetch call to the function import /generate

        // Adjust service path to your service name; change CatalogService if different.
        var sUrl = "/odata/v4/generate-document/generate";

        await fetch(sUrl, { method: "GET", credentials: "same-origin" })
          .then(function (res) {
            if (!res.ok) {
              throw new Error("Network response was not ok: " + res.status);
            }
            return res.json();
          })
          .then(
            async function (data) {
              var aItems;
              if (Array.isArray(data)) {
                aItems = data;
              } else if (data && Array.isArray(data.value)) {
                aItems = data.value;
              } else if (data && typeof data === "object") {
                aItems = [data];
              } else {
                aItems = [];
              }

              // Create JSONModel and bind table to it
              debugger;
              var oDocModel = new JSONModel({ items: aItems });
              oView.setModel(oDocModel, "docs");
              oTable.setBusy(false);
              var oDocsModel = this.getView().getModel("docs");
              var aDocs = oDocsModel.getProperty("/items") || [];

              var mSeen = {};
              var parameterNameSeen = {};
              var aOptions = aDocs.reduce(function (acc, oItem) {
                var v = oItem.isCustomerEditable;
                // adjust property name if different
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
      onGeneratePress: function () {
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
          if(item.getKey() === "true" || item.getKey() === 0){
            return true;
          } else if(item.getKey() === "false" || item.getKey() === 1){
            return false;
          }
          return item.getKey();
        });

        //call the generate action with the selected parameters as filter conditions
        // If no parameters selected, pass empty array to avoid issues in srv side
        var sParamFilter =
          aParamKeys.length > 0 ? aParamKeys.join(",") : " ";
        var sCustomerEditFilter =
          aCustomerEditKeys.length === 1
            ? aCustomerEditKeys[0]
            : " ";
            
        // Adjust service path to your service name; change CatalogService if different.
        var params = {
          parameterName: [sParamFilter],
          isCustomerEditable: sCustomerEditFilter,
        };
        // Create URL with query parameters
        var sUrl =
          "/odata/v4/generate-document/getDocumentCreated?params=" + encodeURIComponent(JSON.stringify(params));

        // Adjust service path to your service name; change CatalogService if different.
        //var sUrl = "/odata/v4/generate-document/helper";

        fetch(sUrl, {
          method: "GET",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          }
        })
          .then(function (res) {
            if (!res.ok) {
              throw new Error("Network response was not ok: " + res.status);
            }
            return res.json();
          })
          .then(
            function (data) {
              MessageBox.success("Document created: " + data);
              oTable.setBusy(false);
            }.bind(this)
          )
          .catch(
            function (err) {
              MessageBox.error(
                err.message || "Failed to call getDocumentCreated function"
              );
              oTable.setBusy(false);
            }.bind(this)
          );
        
      },
    });
  }
);
