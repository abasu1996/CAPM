const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

function validateKey(jsonObj, key) {
    if (!(key in jsonObj || jsonObj.hasOwnProperty(key))) {
        // Key does not exist in the JSON object
        console.log(`Key '${key}' does not exist.`);
        return false;
    }

    if (jsonObj[key] === null) {
        console.log(`Key '${key}' has null value.`);
        return false;
    }

    if (typeof jsonObj[key] === 'object' && Object.keys(jsonObj[key]).length === 0) {
        console.log(`Key '${key}' has empty object value.`);
        return false;
    }

    if (jsonObj[key] === undefined) {
        console.log(`Key '${key}' is undefined.`);
        return false;
    }
    
    // Key exists and has a valid value

  return true;
    
}

async function donotreplicate_func(ObjectID) {

  let response =  await executeHttpRequest({
    destinationName: "Sasol_V2_DEV762"
  },
    {
      method: "GET",
      url: "/sap/c4c/api/v1/account-service/accounts/" + ObjectID,
    });

   etag_get = response.headers.etag;
  console.log(etag_get);
  let postresponse =  executeHttpRequest({
    destinationName: "Sasol_V2_DEV762"
  },
    {
      method: "PATCH",
      url: "/sap/c4c/api/v1/account-service/accounts/" + ObjectID,
      headers: {
        'If-Match': etag_get,
        'Content-Type': 'application/merge-patch+json'
      },
      maxContentLength: Infinity,
      data: {
        "firstLineName": "Samsung Pvt. Ltd. 2",
        "extensions": {
          "Z_DoNotReplicate": false
        }
      }
    },
  );
  //let response_code = postresponse.status.toString();
  console.log("This is PATCH Response");
  
}

module.exports= {validateKey, donotreplicate_func};
