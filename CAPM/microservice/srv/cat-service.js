
module.exports = (say) => {
    say.on("upload", (req) => {
      let data = req._.req.body;
      const jsondata = JSON.stringify(data);
      const jsonstring = JSON.parse(jsondata);
      const ID = jsonstring.currentImage.id;
      const casetype = jsonstring.currentImage.caseType;
      const status = jsonstring.currentImage.status;
      data =  data.currentImage.id;
      console.log(ID);
      const response = {
        data:{
          "status": status,
          "caseType": casetype,
        },
        "error": [
          {
            "code": "external_CaseService.10000",
            "message": "Case type is not allowed.",
            "target": "{caseType}"
          }
        ]
      }
      const jsonresp = JSON.stringify(response);
      const jsonrespj = JSON.parse(jsonresp);
      req._.res.send(jsonrespj);
      
        //return response;
    });
  };