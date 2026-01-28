const cds = require('@sap/cds')

module.exports = class FlightService extends cds.ApplicationService { init() {

  //const {Flight} = cds.entities('FlightService');
  const { Flights, Connections, Airlines, Airports, Supplements, SupplementTypes } = cds.entities('FlightService')

  
  this.after('READ',Flights,async(flight,req)=>{
    console.log("I am Anim, I am learning CAP, I have done my bachelors....",flight);
    
  })

  return super.init()
}}
