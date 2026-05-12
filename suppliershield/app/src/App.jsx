import { useEffect, useMemo, useState } from 'react'
import { getSupplierShieldEntries, getVerifiedSuppliersMessage } from './odata.js'

function SupplierStatus({ active }) {
  return (
    <span className={active ? 'status statusActive' : 'status statusInactive'}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function App() {
  const [suppliers, setSuppliers] = useState([])
  const [verifiedMessage, setVerifiedMessage] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadSuppliers() {
    setLoading(true)
    setError('')

    try {
      const [supplierEntries, message] = await Promise.all([
        getSupplierShieldEntries(),
        getVerifiedSuppliersMessage(),
      ])

      setSuppliers(supplierEntries)
      setVerifiedMessage(message)
    } catch (err) {
      setError(err.message || 'Unable to load supplier shield data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSuppliers()
  }, [])

  const filteredSuppliers = useMemo(() => {
    const searchText = query.trim().toLowerCase()

    return suppliers.filter((supplier) => {
      const matchesSearch = [supplier.firstName, supplier.lastName, supplier.Description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchText)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && supplier.IsActive) ||
        (statusFilter === 'inactive' && !supplier.IsActive)

      return matchesSearch && matchesStatus
    })
  }, [query, statusFilter, suppliers])

  const activeCount = suppliers.filter((supplier) => supplier.IsActive).length
  const inactiveCount = suppliers.length - activeCount

  return (
    <main className="shell">
      <section className="toolbar" aria-label="Supplier Shield controls">
        <div>
          <p className="eyebrow">CAP OData V4</p>
          <h1>Supplier Shield</h1>
        </div>

        <button className="refreshButton" type="button" onClick={loadSuppliers}>
          Refresh
        </button>
      </section>

      <section className="summary" aria-label="Supplier summary">
        <div>
          <span>Total suppliers</span>
          <strong>{suppliers.length}</strong>
        </div>
        <div>
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <span>Inactive</span>
          <strong>{inactiveCount}</strong>
        </div>
      </section>

      {verifiedMessage ? <p className="serviceMessage">{verifiedMessage}</p> : null}

      <section className="filters" aria-label="Supplier filters">
        <input
          type="search"
          placeholder="Search suppliers"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </section>

      {error ? (
        <section className="notice error" role="alert">
          {error}
        </section>
      ) : null}

      {loading ? (
        <section className="notice">Loading supplier data...</section>
      ) : (
        <section className="tableWrap" aria-label="Supplier Shield data">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Description</th>
                <th>Status</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.ID}>
                  <td>
                    <strong>
                      {supplier.firstName} {supplier.lastName}
                    </strong>
                  </td>
                  <td>{supplier.Description}</td>
                  <td>
                    <SupplierStatus active={supplier.IsActive} />
                  </td>
                  <td>{supplier.modifiedAt ? new Date(supplier.modifiedAt).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredSuppliers.length === 0 ? (
            <div className="empty">No suppliers match the selected filters.</div>
          ) : null}
        </section>
      )}
    </main>
  )
}

export default App
