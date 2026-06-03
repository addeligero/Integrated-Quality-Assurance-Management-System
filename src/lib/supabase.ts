type FilterOp = 'eq' | 'neq' | 'in' | 'gte' | 'lt' | 'not'
type SortSpec = { column: string; ascending: boolean }
type FilterSpec = { column: string; op: FilterOp; value: unknown; extra?: unknown }
type ApiResult<T = unknown> = { data: T | null; error: Error | null; count?: number | null }

const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(/\/$/, '')
const TOKEN_KEY = 'quams:auth-token'
const USER_KEY = 'quams:auth-user'
const pendingUploads = new Map<string, File | Blob>()

function token() {
  return localStorage.getItem(TOKEN_KEY)
}

function saveSession(tokenValue: string, user: unknown) {
  localStorage.setItem(TOKEN_KEY, tokenValue)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

function currentUser() {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function authHeaders(): HeadersInit {
  const currentToken = token()
  return currentToken ? { Authorization: `Bearer ${currentToken}` } : {}
}

async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers: HeadersInit = {
    ...authHeaders(),
    ...(options.headers ?? {}),
  }

  let body = options.body
  if ('json' in options) {
    headers['Content-Type' as keyof HeadersInit] = 'application/json'
    body = JSON.stringify(options.json)
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, body })
  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `Request failed: ${response.status}`
    throw new Error(message)
  }

  return payload as T
}

function endpointFor(table: string) {
  const endpoints: Record<string, string> = {
    profiles: '/api/users',
    documents: '/api/documents',
    catergories: '/api/compliance-categories',
    app_settings: '/api/settings',
    notifications: '/api/notifications',
    compliance_items: '/api/compliance-items',
    compliance_accreditations: '/api/compliance-accreditations',
    compliance_requirement_categories: '/api/compliance-requirement-categories',
  }
  return endpoints[table] ?? `/api/${table.split('_').join('-')}`
}

function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: FilterSpec[]) {
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = row[filter.column]
      if (filter.op === 'eq') return value === filter.value
      if (filter.op === 'neq') return value !== filter.value
      if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(value)
      if (filter.op === 'gte') return String(value ?? '') >= String(filter.value ?? '')
      if (filter.op === 'lt') return String(value ?? '') < String(filter.value ?? '')
      if (filter.op === 'not' && filter.extra === null) return value !== null && value !== undefined
      return true
    }),
  )
}

function applySort<T extends Record<string, unknown>>(rows: T[], sorts: SortSpec[]) {
  return [...rows].sort((left, right) => {
    for (const sort of sorts) {
      const a = left[sort.column]
      const b = right[sort.column]
      if (a === b) continue
      const result = String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true })
      return sort.ascending ? result : -result
    }
    return 0
  })
}

function pickColumns<T extends Record<string, unknown>>(rows: T[], columns?: string) {
  if (!columns || columns.trim() === '*' || columns.includes('profiles!') || columns.includes('compliance_')) {
    return rows
  }

  const selected = columns
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)

  return rows.map((row) =>
    selected.reduce<Record<string, unknown>>((acc, column) => {
      acc[column] = row[column]
      return acc
    }, {}),
  )
}

function normalizeRows(table: string, rows: Record<string, unknown>[]) {
  if (table === 'documents') {
    return rows.map((row) => ({
      ...row,
      profiles: row.uploaded_by
        ? {
            f_name: String(row.uploaded_by).split(' ')[0] ?? '',
            l_name: String(row.uploaded_by).split(' ').slice(1).join(' '),
          }
        : null,
    }))
  }
  if (table === 'compliance_items') {
    return rows.map((row) => ({
      ...row,
      compliance_documents: row.supporting_documents,
    }))
  }
  return rows
}

class LocalQueryBuilder {
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private selectedColumns = '*'
  private selectOptions: { count?: 'exact'; head?: boolean } = {}
  private filters: FilterSpec[] = []
  private sorts: SortSpec[] = []
  private limitValue: number | null = null
  private rangeValue: [number, number] | null = null
  private bodyValue: unknown
  private singleMode: 'single' | 'maybeSingle' | null = null

  constructor(private table: string) {}

  select(columns = '*', options: { count?: 'exact'; head?: boolean } = {}) {
    this.selectedColumns = columns
    this.selectOptions = options
    return this
  }

  insert(value: unknown) {
    this.action = 'insert'
    this.bodyValue = value
    return this
  }

  update(value: unknown) {
    this.action = 'update'
    this.bodyValue = value
    return this
  }

  upsert(value: unknown) {
    this.action = 'upsert'
    this.bodyValue = value
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: 'eq', value })
    return this
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, op: 'neq', value })
    return this
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ column, op: 'in', value })
    return this
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, op: 'gte', value })
    return this
  }

  lt(column: string, value: unknown) {
    this.filters.push({ column, op: 'lt', value })
    return this
  }

  not(column: string, op: string, value: unknown) {
    this.filters.push({ column, op: 'not', value: op, extra: value })
    return this
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.sorts.push({ column, ascending: options.ascending !== false })
    return this
  }

  limit(value: number) {
    this.limitValue = value
    return this
  }

  range(from: number, to: number) {
    this.rangeValue = [from, to]
    return this
  }

  single() {
    this.singleMode = 'single'
    return this
  }

  maybeSingle() {
    this.singleMode = 'maybeSingle'
    return this
  }

  then<TResult1 = ApiResult, TResult2 = never>(
    onfulfilled?: ((value: ApiResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<ApiResult> {
    try {
      if (this.action === 'select') return await this.executeSelect()
      if (this.action === 'insert') return await this.executeInsert()
      if (this.action === 'update') return await this.executeUpdate()
      if (this.action === 'delete') return await this.executeDelete()
      return await this.executeUpsert()
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
    }
  }

  private async executeSelect(): Promise<ApiResult> {
    const rows = normalizeRows(this.table, await this.fetchRows())
    let filtered = applyFilters(rows, this.filters)
    filtered = applySort(filtered, this.sorts)

    const count = filtered.length
    if (this.rangeValue) filtered = filtered.slice(this.rangeValue[0], this.rangeValue[1] + 1)
    if (this.limitValue !== null) filtered = filtered.slice(0, this.limitValue)

    if (this.selectOptions.head) return { data: null, error: null, count }

    const selected = pickColumns(filtered, this.selectedColumns)
    if (this.singleMode) {
      const row = selected[0] ?? null
      if (!row && this.singleMode === 'single') return { data: null, error: new Error('No rows found') }
      return { data: row, error: null, count }
    }
    return { data: selected, error: null, count }
  }

  private async executeInsert(): Promise<ApiResult> {
    if (this.table === 'compliance_item_documents') {
      await this.replaceComplianceDocumentsFromJoinInsert(this.bodyValue)
      return { data: this.bodyValue, error: null }
    }

    const rows = Array.isArray(this.bodyValue) ? this.bodyValue : [this.bodyValue]
    const created = []
    for (const row of rows as Array<Record<string, unknown>>) {
      created.push(await this.createRow(row))
    }
    const data = Array.isArray(this.bodyValue) ? created : created[0]
    return { data: this.singleMode ? created[0] : data, error: null }
  }

  private async executeUpdate(): Promise<ApiResult> {
    const idFilter = this.filters.find((filter) => filter.column === 'id' && filter.op === 'eq')
    const idListFilter = this.filters.find((filter) => filter.column === 'id' && filter.op === 'in')

    if (this.table === 'notifications' && idFilter) {
      const row = await api(`${endpointFor(this.table)}/${idFilter.value}/read`, { method: 'PATCH' })
      return { data: row, error: null }
    }

    const ids = idFilter ? [String(idFilter.value)] : idListFilter && Array.isArray(idListFilter.value) ? idListFilter.value.map(String) : []
    const updated = []
    if (ids.length) {
      for (const id of ids) updated.push(await this.patchById(id, this.bodyValue as Record<string, unknown>))
      return { data: this.singleMode ? updated[0] : updated, error: null }
    }

    const rows = applyFilters(await this.fetchRows(), this.filters)
    for (const row of rows) updated.push(await this.patchById(String(row.id), this.bodyValue as Record<string, unknown>))
    return { data: updated, error: null }
  }

  private async executeUpsert(): Promise<ApiResult> {
    const payload = this.bodyValue as Record<string, unknown>
    if (this.table === 'app_settings') {
      await api(endpointFor(this.table), { method: 'PATCH', json: { [String(payload.key)]: payload.value } })
      return { data: payload, error: null }
    }
    if (this.table === 'profiles' && payload.id) {
      const row = await this.patchById(String(payload.id), payload)
      return { data: row, error: null }
    }
    return this.executeInsert()
  }

  private async executeDelete(): Promise<ApiResult> {
    if (this.table === 'compliance_item_documents') {
      const itemId = this.filters.find((filter) => filter.column === 'compliance_item_id')?.value
      if (itemId) await api(`/api/compliance-items/${itemId}`, { method: 'PATCH', json: { supporting_documents: [] } })
      return { data: null, error: null }
    }

    if (this.table === 'compliance_requirement_categories') {
      const accreditationName = this.filters.find((filter) => filter.column === 'accreditation_name')?.value
      const requirementKey = this.filters.find((filter) => filter.column === 'requirement_key')?.value
      await api(endpointFor(this.table), {
        method: 'DELETE',
        json: { accreditation_name: accreditationName, requirement_key: requirementKey },
      })
      return { data: null, error: null }
    }

    const rows = applyFilters(await this.fetchRows(), this.filters)
    for (const row of rows) await this.deleteByIdOrName(row)
    return { data: null, error: null }
  }

  private async fetchRows(): Promise<Record<string, unknown>[]> {
    if (this.table === 'profiles' && !token()) {
      return []
    }
    if (this.table === 'app_settings') {
      const settings = await api<Record<string, string>>(endpointFor(this.table))
      return Object.entries(settings).map(([key, value]) => ({ key, value }))
    }
    return await api<Record<string, unknown>[]>(endpointFor(this.table))
  }

  private async createRow(row: Record<string, unknown>) {
    if (this.table === 'documents') {
      const file = row.path ? pendingUploads.get(String(row.path)) : null
      if (!file) throw new Error('No local file found for document upload')
      const formData = new FormData()
      formData.append('file', file, String(row.file_name ?? 'document'))
      return await api(endpointFor(this.table) + '/upload', { method: 'POST', body: formData })
    }
    if (this.table === 'profiles') return await api(endpointFor(this.table), { method: 'POST', json: row })
    if (this.table === 'compliance_accreditations') return await api(endpointFor(this.table), { method: 'POST', json: row })
    if (this.table === 'catergories') return await api(endpointFor(this.table), { method: 'POST', json: row })
    if (this.table === 'notifications') return await api(endpointFor(this.table), { method: 'POST', json: row })
    if (this.table === 'compliance_items') return await api(endpointFor(this.table), { method: 'POST', json: row })
    if (this.table === 'compliance_requirement_categories') {
      return await api(endpointFor(this.table), {
        method: 'POST',
        json: {
          accreditation_name: row.accreditation_name,
          requirement_key: row.requirement_key,
          category_id: row.category_id,
        },
      })
    }
    throw new Error(`Insert is not implemented for ${this.table}`)
  }

  private async patchById(id: string, payload: Record<string, unknown>) {
    if (this.table === 'profiles') {
      if ('role' in payload) await api(`${endpointFor(this.table)}/${id}/role`, { method: 'PATCH', json: { role: payload.role } })
      if ('status' in payload) {
        await api(`${endpointFor(this.table)}/${id}/${payload.status ? 'activate' : 'deactivate'}`, { method: 'PATCH' })
      }
      return await api(`${endpointFor(this.table)}/${id}`, { method: 'PATCH', json: payload })
    }
    if (this.table === 'compliance_items' && 'status' in payload && Object.keys(payload).length === 1) {
      return await api(`${endpointFor(this.table)}/${id}/status`, { method: 'PATCH', json: payload })
    }
    if (this.table === 'compliance_accreditations') {
      return await api(`${endpointFor(this.table)}/${encodeURIComponent(id)}`, { method: 'PATCH', json: payload })
    }
    return await api(`${endpointFor(this.table)}/${id}`, { method: 'PATCH', json: payload })
  }

  private async deleteByIdOrName(row: Record<string, unknown>) {
    if (this.table === 'compliance_accreditations') {
      await api(`${endpointFor(this.table)}/${encodeURIComponent(String(row.name))}`, { method: 'DELETE' })
      return
    }
    await api(`${endpointFor(this.table)}/${row.id}`, { method: 'DELETE' })
  }

  private async replaceComplianceDocumentsFromJoinInsert(value: unknown) {
    const rows = Array.isArray(value) ? value : [value]
    const byItem = new Map<string, string[]>()
    for (const row of rows as Array<Record<string, unknown>>) {
      const itemId = String(row.compliance_item_id ?? '')
      const docId = String(row.document_id ?? '')
      if (!itemId || !docId) continue
      byItem.set(itemId, [...(byItem.get(itemId) ?? []), docId])
    }
    for (const [itemId, documentIds] of byItem) {
      await api(`/api/compliance-items/${itemId}`, {
        method: 'PATCH',
        json: { supporting_documents: documentIds },
      })
    }
  }
}

function localFrom(table: string) {
  return new LocalQueryBuilder(table)
}

function localChannel(_name: string) {
  return {
    on: () => localChannel(_name),
    subscribe: () => localChannel(_name),
    unsubscribe: async () => {},
  }
}

const auth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const username = email.split('@')[0]
      const data = await api<{ token: string; user: Record<string, unknown> }>('/api/auth/login', {
        method: 'POST',
        json: { username, password },
      })
      saveSession(data.token, data.user)
      return { data: { user: { ...data.user, email }, session: { access_token: data.token } }, error: null }
    } catch (error) {
      return { data: { user: null, session: null }, error }
    }
  },
  async getSession() {
    const user = currentUser()
    const currentToken = token()
    return {
      data: {
        session: currentToken && user ? { access_token: currentToken, user: { ...user, email: user.email } } : null,
      },
      error: null,
    }
  },
  async signOut() {
    clearSession()
    return { error: null }
  },
  onAuthStateChange(_callback: (event: string) => void) {
    return { data: { subscription: { unsubscribe: () => {} } } }
  },
  async updateUser({ password }: { password?: string }) {
    const user = currentUser()
    if (!user?.id || !password) return { data: null, error: new Error('No active user') }
    try {
      await api(`/api/users/${user.id}/reset-password`, { method: 'POST', json: { password } })
      return { data: { user }, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },
  mfa: {
    async listFactors() {
      return { data: { totp: [], all: [] }, error: null }
    },
    async enroll() {
      return { data: null, error: new Error('MFA setup is handled by the local login endpoint') }
    },
    async unenroll() {
      return { data: null, error: null }
    },
    async challengeAndVerify() {
      return { data: null, error: null }
    },
    async getAuthenticatorAssuranceLevel() {
      return { data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }
    },
  },
  admin: {
    async listUsers() {
      const users = await api<Record<string, unknown>[]>('/api/users')
      return { data: { users }, error: null }
    },
    async createUser({ email, password }: { email: string; password: string }) {
      try {
        const username = email.split('@')[0]
        const user = await api<Record<string, unknown>>('/api/users', {
          method: 'POST',
          json: { username, password, f_name: username, l_name: 'User', email, role: 'user' },
        })
        return { data: { user }, error: null }
      } catch (error) {
        return { data: { user: null }, error }
      }
    },
    async updateUserById(id: string, payload: { password?: string; ban_duration?: string }) {
      try {
        if (payload.password) {
          await api(`/api/users/${id}/reset-password`, { method: 'POST', json: { password: payload.password } })
        }
        if (payload.ban_duration) {
          await api(`/api/users/${id}/${payload.ban_duration === 'none' ? 'activate' : 'deactivate'}`, {
            method: 'PATCH',
          })
        }
        return { data: null, error: null }
      } catch (error) {
        return { data: null, error }
      }
    },
  },
}

const storage = {
  from(_bucket: string) {
    return {
      async upload(path: string, file: File | Blob) {
        pendingUploads.set(path, file)
        return { data: { path }, error: null }
      },
      async download(path: string) {
        try {
          const docs = await api<Array<{ id: string; path: string }>>('/api/documents')
          const doc = docs.find((item) => item.path === path || item.id === path)
          if (!doc) throw new Error('Document not found')
          const response = await fetch(`${API_BASE}/api/documents/${doc.id}/download`, {
            headers: authHeaders(),
          })
          if (!response.ok) throw new Error('Download failed')
          return { data: await response.blob(), error: null }
        } catch (error) {
          return { data: null, error }
        }
      },
      async remove(_paths: string[]) {
        return { data: null, error: null }
      },
      async createSignedUrl(path: string) {
        const docs = await api<Array<{ id: string; path: string }>>('/api/documents')
        const doc = docs.find((item) => item.path === path || item.id === path)
        return {
          data: { signedUrl: doc ? `${API_BASE}/api/documents/${doc.id}/download` : '' },
          error: doc ? null : new Error('Document not found'),
        }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: path } }
      },
    }
  },
}

const supabase: any = {
  from: localFrom,
  auth,
  storage,
  channel: localChannel,
  removeChannel: async () => {},
}

export const supabaseAdmin: any = supabase
export default supabase
