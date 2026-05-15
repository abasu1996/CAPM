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

  this.on ('findDuplicateSuppliers', async (req) => {
    const firstName = String(req.data.firstName || '').trim()
    const lastName = String(req.data.lastName || '').trim()

    if (!firstName && !lastName) {
      return []
    }

    let query = SELECT.from(SupplierShield)

    if (firstName && lastName) {
      query = query.where`
        lower(firstName) = ${firstName.toLowerCase()} and lower(lastName) = ${lastName.toLowerCase()}
      `
    } else if (firstName) {
      query = query.where`lower(firstName) = ${firstName.toLowerCase()}`
    } else {
      query = query.where`lower(lastName) = ${lastName.toLowerCase()}`
    }

    const suppliers = await query

    return suppliers
  })

  return super.init()
}}
