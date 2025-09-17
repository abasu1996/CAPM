const env = require('dot-env').config;
const cds = require('@sap/cds')
const {DocGenerator} = require('./docgeneratorclass');





const SapCfAxios = require('sap-cf-axios').default;
module.exports = class generateDocument extends cds.ApplicationService { init() {
const destinationName = 'ariba-api';
//let restApi = cds.connect.to('restApi');

  this.on ('generate', async (req) => {
    const axios = SapCfAxios(destinationName);
    console.log('On generate', process.env.apiKey, process.env.realm);

    let docResponse = await axios({
      method:'get',
      url:'/parameters',
      params:{
        "includeMetadata": true,
        "realm": process.env.realm
      },
      headers:{
        "Accept": 'application/json',
        "apiKey": process.env.apiKey
      }
    });

   

    try {
      console.log(typeof docResponse.data);
      var filterPayload = [];
      docResponse.data.forEach((item,index) => {
        
        if(item.defaultValue !== item.parameterValue) {
          
          filterPayload.push(item);
          
        }
      
      });
      console.log(`Length of filterPayload: ${docResponse.data.length}`);
      console.log(`Length of filterPayload: ${filterPayload.length}`);
      
      const gen = new DocGenerator(filterPayload, { creator: "Doc Generator" });
      
      const out = await gen.generateCombined("Audit-AutoReject-EmailApprovals.docx");



      console.log(`Saved ${out}`);
    } catch (err) {
      console.error("Failed to generate doc:", err);
    }

    return docResponse.data.value;



  })

  return super.init()
}}
