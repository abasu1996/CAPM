const env = require('dot-env').config;
const cds = require('@sap/cds')


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

    console.log('Response from Ariba API', docResponse.data)

    return docResponse.data;



  })

  return super.init()
}}
