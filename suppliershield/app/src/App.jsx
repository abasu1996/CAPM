import { useEffect, useMemo, useState } from 'react'
import {
  findDuplicateSuppliers,
  getSupplierShieldEntries,
  getVerifiedSuppliersMessage,
} from './odata.js'

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
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [duplicateSuppliers, setDuplicateSuppliers] = useState([])
  const [duplicateSearchDone, setDuplicateSearchDone] = useState(false)
  const [duplicateLoading, setDuplicateLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [duplicateError, setDuplicateError] = useState('')

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

  useEffect(() => {
    const searchedFirstName = firstName.trim()
    const searchedLastName = lastName.trim()
    const searchedEmail = email.trim()

    if (!searchedFirstName && !searchedLastName && !searchedEmail) {
      setDuplicateSearchDone(false)
      setDuplicateSuppliers([])
      setDuplicateError('')
      setDuplicateLoading(false)
      return undefined
    }

    let ignoreResult = false
    setDuplicateLoading(true)
    setDuplicateSearchDone(false)
    setDuplicateError('')

    const searchTimer = window.setTimeout(async () => {
      try {
        const duplicates = await findDuplicateSuppliers(
          searchedFirstName,
          searchedLastName,
          searchedEmail,
        )

        if (!ignoreResult) {
          setDuplicateSuppliers(duplicates)
          setDuplicateSearchDone(true)
        }
      } catch (err) {
        if (!ignoreResult) {
          setDuplicateSuppliers([])
          setDuplicateError(err.message || 'Unable to search duplicate suppliers.')
        }
      } finally {
        if (!ignoreResult) {
          setDuplicateLoading(false)
        }
      }
    }, 300)

    return () => {
      ignoreResult = true
      window.clearTimeout(searchTimer)
    }
  }, [firstName, lastName, email])


  const filteredSuppliers = useMemo(() => {
    const searchText = query.trim().toLowerCase()

    return suppliers.filter((supplier) => {
      const matchesSearch = [supplier.firstName, supplier.lastName, supplier.email, supplier.Description]
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

  const duplicateIds = useMemo(
    () => new Set(duplicateSuppliers.map((supplier) => supplier.ID)),
    [duplicateSuppliers],
  )
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

      <section className="duplicateSearch" aria-label="Duplicate supplier search">
        <div>
          <label htmlFor="firstName">First name</label>
          <input
            id="firstName"
            type="text"
            placeholder="Enter first name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="lastName">Last name</label>
          <input
            id="lastName"
            type="text"
            placeholder="Enter last name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="Enter email or domain"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
      </section>

      {duplicateError ? (
        <section className="notice error" role="alert">
          {duplicateError}
        </section>
      ) : null}

      {duplicateLoading ? (
        <section className="duplicateResults" aria-live="polite">
          <strong>Checking for duplicates...</strong>
        </section>
      ) : null}

      {duplicateSearchDone && !duplicateLoading ? (
        <section
          className={duplicateSuppliers.length > 0 ? 'duplicateResults found' : 'duplicateResults'}
          aria-live="polite"
        >
          <strong>
            {duplicateSuppliers.length > 0
              ? `${duplicateSuppliers.length} duplicate record${duplicateSuppliers.length === 1 ? '' : 's'} found`
              : 'No duplicate records found'}
          </strong>
          {duplicateSuppliers.length > 0 ? (
            <ul>
              {duplicateSuppliers.map((supplier) => (
                <li key={supplier.ID}>
                  {supplier.firstName} {supplier.lastName} - {supplier.email || 'No email'} -{' '}
                  {supplier.Description || 'No description'}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

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
                <th>Email</th>
                <th>Description</th>
                <th>Status</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((supplier) => (
                <tr
                  key={supplier.ID}
                  className={duplicateIds.has(supplier.ID) ? 'duplicateRow' : undefined}
                >
                  <td>
                    <strong>
                      {supplier.firstName} {supplier.lastName}
                    </strong>
                  </td>
                  <td>{supplier.email || '-'}</td>
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
