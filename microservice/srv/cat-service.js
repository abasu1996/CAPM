
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
    }
    let data = req._.req.body;
    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    let accountTeam = jsonstring.currentImage.accountTeamMembers;
    const accountcreationscreen = jsonstring.beforeImage;
    let accountTeamrole = "";
    let readyforsample_ex = jsonstring.currentImage.extensions.Z_ReadyForSample;
    if (Object.keys(accountcreationscreen).length !== 0) {
      accountTeam.forEach(element => {
        if (element.role === "ZCR") {
          accountTeamrole = element.role;
        }
      });
      if(readyforsample_ex)
      {
        if (accountTeamrole === "ZCR") {
  
          req._.res.send(cust_pos_resp);
        }
        else{
          const cust_neg_resp = {
            "noChanges": true,
            "error": [
              {
                "code": "external_AccountService.10000",
                "message": "Sorry! ZCR Role in not maintained in Account Team, Please maintain and proceed",
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
    else
    {
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
    //req._.res.send(jsonstring);

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