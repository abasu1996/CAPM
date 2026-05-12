const SERVICE_ROOT = import.meta.env.VITE_ODATA_BASE_URL || '/odata/v4/supplier-shield'

function normalizeODataCollection(payload) {
  if (Array.isArray(payload?.value)) {
    return payload.value
  }

  if (Array.isArray(payload)) {
    return payload
  }

  return []
}

export async function getSupplierShieldEntries() {
  const response = await fetch(`${SERVICE_ROOT}/SupplierShield?$orderby=firstName asc`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Supplier Shield service returned ${response.status}`)
  }

  return normalizeODataCollection(await response.json())
}

export async function getVerifiedSuppliersMessage() {
  const response = await fetch(`${SERVICE_ROOT}/getVerifiedSuppliers(params='')`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    return ''
  }

  const payload = await response.json()
  return payload?.value || ''
}
