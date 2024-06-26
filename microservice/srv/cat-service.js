const cds = require('@sap/cds');
const express = require('express');
const validateKey = require('./reusablefunctions');
const { log } = require('console');
module.exports = (say) => {
  say.on("upload", (req, res) => {
    const cust_pos_resp = {
      "noChanges": true
    }
    let data = req._.req.body;
    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    const ID = jsonstring.currentImage.id;
    const casetype = jsonstring.currentImage.caseType;
    //const status = jsonstring.currentImage.status;
    data = data.currentImage.id;
    console.log(ID);
    const response = {
      "noChanges": true,
      "error": [
        {
          "code": "external_CaseService.10000",
          "message": "Ye wala case supported nahin hain.. CHANGE IT.",
          "target": "{caseType}"
        }
      ]
    }

    const jsonresp = JSON.stringify(response);
    const jsonrespj = JSON.parse(jsonresp);
    if (casetype === "ZCMP") {
      req._.res.send(jsonrespj);
    }
    else {
      req._.res.send(cust_pos_resp);
    }

    //return response;
  });









  /****************CUSTOMER LOGIC ***************/

  say.on("customer", (req, res) => {

    const cust_pos_resp = {
      "noChanges": true
    };
    let data = req._.req.body;

    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    console.log(jsondata);
    let accountTeam = jsonstring.currentImage;
    console.log("Account Team " + accountTeam);
    let beforechange = "beforeImage";
    let extensionkey = "extensions";
    let readyforsample = "Z_ReadyForSample";
    let accountTeamrole = "";
    let valindi = validateKey(jsonstring, beforechange);
    let readyforsampleindi = validateKey(accountTeam,extensionkey);
    console.log(readyforsampleindi);
    let readyforsample_ex = false;
    console.log(valindi);
    if (valindi !== false) {
      var teamcheck = accountTeam.hasOwnProperty('accountTeamMembers');
      console.log("TEAM CHECK " + teamcheck);
      if (accountTeam.hasOwnProperty('accountTeamMembers')) {
        console.log("Team check started");
        const accountteammember = accountTeam.accountTeamMembers;
        console.log(accountteammember);
        accountteammember.forEach(element => {
          console.log(element.role);
          if(element.role === "ZCSR-1") 
          {
            accountTeamrole = element.role;
            console.log("TEST Log " + accountTeamrole);
          };
          console.log(element.role);
        });
      }
      if(readyforsampleindi)
      {
        let extensionkeyobj = jsonstring.currentImage.extensions;
        if(validateKey(extensionkeyobj,readyforsample))
        {
          readyforsample_ex = extensionkeyobj.Z_ReadyForSample;
        }
      }
      console.log(readyforsample_ex);
      if (readyforsample_ex) {
        console.log("IN1");
        if (accountTeamrole === "ZCSR-1") {
          console.log("IN2");
          req._.res.send(cust_pos_resp);
        }
        else {
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
  });










  say.on("lead", (req, res) => {

    let data = req._.req.body;

    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    req._.res.send(jsonstring);

  });
















  say.on("opportunity", (req, res) => {

    let data = req._.req.body;

    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    req._.res.send(jsonstring);

  });













  say.on("quote", (req, res) => {

    let data = req._.req.body;

    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    req._.res.send(jsonstring);

  });
};