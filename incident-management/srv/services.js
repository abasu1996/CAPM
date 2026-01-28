const cds = require('@sap/cds');
const { ref } = require('@sap/cds/lib/compile/parse');
const { data } = require('@sap/cds/lib/dbs/cds-deploy');
const { where, SELECT, columns, expand } = require('@sap/cds/lib/ql/cds-ql');

module.exports = class ProcessorService extends cds.ApplicationService { init() {
const {Incidents,Customers} = cds.entities('sap.capire.incidents');
this.before('CREATE', 'Incidents', async (req) => {
  //this.changeinStatusBasedonUrgency(req.data);
});

this.on('CREATE', '*', async (req) => {
  var results = [];
  
  var transaction = await cds.tx(req);
  console.log("SQL Compilation.....",transaction);
  //req.data.title = req.data.title + " - Anim";
  console.log(req.data);
  
  results = await transaction.run(INSERT.into(Incidents).entries(req.data));

  
  
  

  //results = await cds.tx(req).run(SELECT.from(Incidents));
  //console.log(results);
  
  return results;
});

this.on('READ','Customers', async (req)=>{
  var results = [];
  var results2 = [];
  var transaction = await cds.tx(req);
  //console.log("SQL Compilation.....",transaction);
  
  //results = await cds.tx(req).run(SELECT.from(Customers).columns('ID','firstName','lastName',{ref:['incidents'],expand:[{ref:['ID']},{ref:['title']},{ref:['status_code']}]}));

  //results = await cds.tx(req).run(SELECT.from(Customers).columns('ID','firstName','lastName',{ref:['incidents'],expand:[{ref:['ID']},{ref:['title']},{ref:['status_code']}]}));

    results2 = await cds.tx(req).run(SELECT.from(Customers).columns('ID','firstName','lastName',{ref:['incidents'],expand:[{ref:['ID']},{ref:['status_code']},{ref:['title']}]}))
  //console.log(results);
  
  return results2;
},);


this.before('UPDATE', 'Incidents', async (req) => {
  this.onUpdate(req.data);
});

this.on('READ','Incidents', async (req)=>{
  var results = [];
  
  var transaction = await cds.tx(req);
  console.log("SQL Compilation.....",transaction);
  
  results = await cds.tx(req).run(SELECT.from(Incidents));
  //console.log(results);
  
  return results;
});





  return super.init()
}
changeinStatusBasedonUrgency(data){
  let urgency = data.title?.match(/urgent/i);
  if (urgency){
    data.status_code = 'H';
  } else {
    data.status_code = 'M';
  }
}

onUpdate(data){
  if (data.urgency === '1') {
    data.status_code = 'H';
  } else if (data.urgency === '2') {
    data.status_code = 'M';
  } else if (data.urgency === '3') {
    data.status_code = 'L';
  }
}
}
