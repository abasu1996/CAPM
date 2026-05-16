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
    const email = String(req.data.email || '').trim()
    const emailDomain = email.includes('@') ? email.split('@').pop().trim() : email

    if (!firstName && !lastName && !email) {
      return []
    }

    const filters = []

    if (firstName) {
      filters.push({ field: 'firstName', value: firstName.toLowerCase() })
    }
    if (lastName) {
      filters.push({ field: 'lastName', value: lastName.toLowerCase() })
    }
    if (emailDomain) {
      filters.push({ field: 'email', operator: 'like', value: `%${emailDomain.toLowerCase()}` })
    }

    const where = filters.reduce((expression, filter) => {
      const condition = [
        { func: 'lower', args: [{ ref: [filter.field] }] },
        filter.operator || '=',
        { val: filter.value },
      ]
      return expression.length ? [...expression, 'and', ...condition] : condition
    }, [])

    const suppliers = await SELECT.from(SupplierShield).where(where)

    return suppliers
  })

  return super.init()
}}
