const cds = require('@sap/cds');
const express = require('express');
const {donotreplicate_func,validateKey} = require('./reusablefunctions');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
module.exports = (srv) => {

  srv.on("customer", async (req, res) => {
    const cust_pos_resp = {
      "noChanges": true
    };
    let data = req._.req.body;
    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    let accountTeam = jsonstring.currentImage;
    let ObjectID = accountTeam.id;
    let salesarrangement = "salesArrangements";
    let salesarrangementvalidkey = validateKey(accountTeam, salesarrangement);
    console.log("sales arranegement val log" + salesarrangementvalidkey);
    console.log("Account Team " + accountTeam);
    let beforechange = "beforeImage";
    let extensionkey = "extensions";
    let readyforsample = "Z_ReadyForSample";
    let accountTeamrole = "";
    let valindi = validateKey(jsonstring, beforechange);
    let readyforsampleindi = validateKey(accountTeam, extensionkey);
    let etag_get;
    console.log(readyforsampleindi);
    let readyforsample_ex = false;
    console.log("valindi log" + valindi);
    if (valindi !== false) {
      var teamcheck = accountTeam.hasOwnProperty('accountTeamMembers');
      console.log("TEAM CHECK " + teamcheck);
      if (accountTeam.hasOwnProperty('accountTeamMembers')) {
        console.log("Team check started");
        const accountteammember = accountTeam.accountTeamMembers;
        console.log(accountteammember);
        accountteammember.forEach(element => {
          console.log(element.role);
          if (element.role === "ZCSR-1") {
            accountTeamrole = element.role;
            console.log("TEST Log " + accountTeamrole);
          };
          console.log(element.role);
        });
      }
      if (readyforsampleindi) {
        let extensionkeyobj = jsonstring.currentImage.extensions;
        if (validateKey(extensionkeyobj, readyforsample)) {
          readyforsample_ex = extensionkeyobj.Z_ReadyForSample;
        }
      }
      console.log(readyforsample_ex);
      if (readyforsample_ex) {
        console.log("IN1");
        if ((accountTeamrole === "ZCSR-1") && (salesarrangementvalidkey === true)) {
          req._.res.send(cust_pos_resp);
        }
        else if ((accountTeamrole !== "ZCSR-1") && (salesarrangementvalidkey === true)) {
          const cust_neg_resp = {
            "noChanges": true,
            "error": [
              {
                "code": "external_AccountService.10000",
                "message": "Sorry! CSR Role is not maintained in Account Team, Please maintain and proceed",
                "target": "{accountTeamMembers.role}"
              }
            ]
          };

          req._.res.send(cust_neg_resp);
        }
        else if ((accountTeamrole === "ZCSR-1") && (salesarrangementvalidkey === false)) {
          const cust_sales_arr = {
            "noChanges": true,
            "error": [
              {
                "code": "external_AccountService.10000",
                "message": "Sorry! Sales Data is Empty, Please maintain and proceed",
                "target": "{salesArrangements}"
              }
            ]

          };
          req._.res.send(cust_sales_arr);
        }
        else if ((accountTeamrole !== "ZCSR-1") && (salesarrangementvalidkey === false)) {
          const role_and_salesarr = {
            "noChanges": true,
            "error": [
              {
                "code": "external_AccountService.10000",
                "message": "Sorry! Sales Data is Empty, Please maintain and proceed",
                "target": "{salesArrangements}"
              },
              {
                "code": "external_AccountService.10000",
                "message": "CSR Role is not maintained in Account Team, Please maintain and proceed",
                "target": "{accountTeamMembers.role}"
              }
            ]

          };
          req._.res.send(role_and_salesarr);
        }
      }
      else
        req._.res.send(cust_pos_resp);

    }
    else {
      const noval_creationScreen = {
        "noChanges": true,
        "info": [
          {
            "code": "external_AccountService.10001",
            "message": "Validation Skipped for Creation Screen",
            "target": "",
            "severity": "INFO"
          }
        ]

      }
      req._.res.send(noval_creationScreen);
    }

    //donotreplicate_func(ObjectID);
    if((!salesarrangementvalidkey) && (accountTeamrole !== "ZCSR-1")){
      
      await donotreplicate_func(ObjectID);
      console.log("This is PATCH Response HAHAHA");
    }

  });




  srv.on("aynccustomer", async (req, res) => {

    let data = req._.req.body;
    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    let accountTeam = jsonstring.currentImage;
    let ObjectID = accountTeam.id;
    try {
      let response =  executeHttpRequest({
        destinationName: "Sasol_V2_DEV762"
      },
        {
          method: "GET",
          url: "/sap/c4c/api/v1/account-service/accounts/" + ObjectID,
        });

      let etag_get = response.headers.etag;
      console.log(etag_get);
      let postresponse =  executeHttpRequest({
        destinationName: "Sasol_V2_DEV762"
      },
        {
          method: "PATCH",
          url: "/sap/c4c/api/v1/account-service/accounts/" + ObjectID,
          headers: {
            'If-Match': '*',
            'Content-Type': 'application/merge-patch+json'
          },
          maxContentLength: Infinity,
          data: {
            "firstLineName": "Silverstar BTP Code"
          }
        }
      );
      let response_code = postresponse.status.toString();
      console.log("This is PATCH Response" + response_code);

    } catch (error) {
      console.log(error.response);
    };

  });
  srv.on("opportunity", (req, res) => {

  });
  srv.on("lead", (req, res) => {

  });
  srv.on("appointment", (req, res) => {

  });
  srv.on("quote", (req, res) => {

  });
}