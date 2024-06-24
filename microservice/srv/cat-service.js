
module.exports = (say) => {
  say.on("upload", (req, res) => {
    let data = req._.req.body;
    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    const ID = jsonstring.currentImage.id;
    const casetype = jsonstring.currentImage.caseType;
    const status = jsonstring.currentImage.status;
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

    const positiveresp = {
      "noChanges": true
    }
    const jsonresp = JSON.stringify(response);
    const jsonrespj = JSON.parse(jsonresp);
    if (casetype === "ZCMP") {
      req._.res.send(jsonrespj);
    }
    else {
      req._.res.send(positiveresp);
    }

    //return response;
  });
  say.on("customer", (req, res) => {
    let data = req._.req.body;
    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    let accountTeam = jsonstring.currentImage.accountTeamMembers;
    let accountcreationscreen = jsonstring.beforeImage;
    let accountTeamrole = "";
    if (accountcreationscreen !== null) {
      accountTeam.forEach(element => {
        if (element.role === "ZCR") {
          accountTeamrole = element.role;
        }
      });
      if (accountTeamrole === "ZCR") {
        const cust_pos_resp = {
          "noChanges": true
        }
        req._.res.send(cust_pos_resp);
      }
      else {
        const cust_neg_resp = {
          "noChanges": true,
          "error": [
            {
              "code": "external_AccountService.10000",
              "message": "ZCSR Role Nahin hain Account Team Mamber me. Pehle usko maintain karo",
              "target": "{accountTeamMembers.role}"
            }
          ]
        };
        req._.res.send(cust_neg_resp);
      }
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