const cds = require('@sap/cds')
const { response } = require('express')


module.exports = class data extends cds.ApplicationService { init() {

  const { Flights } = cds.entities('sap.capire.flights.data')

  


  return super.init()
}}
