
module.exports = (say) => {
  say.on("upload", (req,res) => {
    let data = req._.req.body;
    const jsondata = JSON.stringify(data);
    const jsonstring = JSON.parse(jsondata);
    const ID = jsonstring.currentImage.id;
    const casetype = jsonstring.currentImage.caseType;
    const status = jsonstring.currentImage.status;
    data =  data.currentImage.id;
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
    if(casetype === "ZCMP")
    {
    req._.res.send(jsonrespj);
    }
    else
    {
    req._.res.send(positiveresp);
    }
    
      //return response;
  });
};