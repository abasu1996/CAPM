const cds = require('@sap/cds')

module.exports = class SupplierShieldService extends cds.ApplicationService { init() {

  const { SupplierShield } = cds.entities('SupplierShieldService')

  this.before (['CREATE', 'UPDATE'], SupplierShield, async (req) => {
    console.log('Before CREATE/UPDATE SupplierShield', req.data)
  })
  this.after ('READ', SupplierShield, async (supplierShield, req) => {
    console.log('After READ SupplierShield', supplierShield)
  })

  this.on ('getVerifiedSuppliers', async (req) => {
    console.log('On getVerifiedSuppliers', req.data)
    return "List of verified suppliers"
  })

  return super.init()
}}
