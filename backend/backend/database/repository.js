const crypto = require('node:crypto')
const schemas = require('./schema')
const { getDatabase, isValidId } = require('./index')
const repositories = new Map()
const quote = (name) => `"${name}"`
const bind = (value) => value instanceof Date ? value.toISOString() : typeof value === 'boolean' ? Number(value) : value ?? null
const validationError = (message) => Object.assign(new Error(message), { name: 'ValidationError' })
function databaseError(error) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return Object.assign(new Error('A record with this unique value already exists'), { code: 11000 })
  }
  if (error.code?.startsWith('SQLITE_CONSTRAINT')) return validationError('Invalid data or a linked record prevents this change')
  return error
}

// Only application-defined fields and operators become SQL; all data uses bindings.
function where(model, filter = {}) {
  const values = []
  const column = (field) => {
    if (!['_id', 'createdAt', 'updatedAt', ...Object.keys(model.fields)].includes(field)) throw validationError('Unknown filter field')
    return quote(field)
  }
  const visit = (part) => Object.entries(part).map(([key, value]) => {
    if (key === '$and' || key === '$or') return `(${value.map(visit).join(key === '$and' ? ' AND ' : ' OR ') || (key === '$and' ? '1' : '0')})`
    if (key === '$expr') {
      const [left, right] = value.$lte
      return `${column(left.slice(1))} <= ${column(right.slice(1))}`
    }
    const field = column(key)
    if (value === null || value === undefined) return `${field} IS NULL`
    if (typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).map(([operator, operand]) => {
        if (operator === '$exists') return `${field} IS ${operand ? 'NOT ' : ''}NULL`
        if (operator === '$in' || operator === '$nin') {
          if (!operand.length) return operator === '$in' ? '0' : '1'
          values.push(...operand.map(bind))
          return `${field} ${operator === '$nin' ? 'NOT ' : ''}IN (${operand.map(() => '?').join(',')})`
        }
        const comparison = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=', $ne: 'IS NOT' }[operator]
        if (!comparison) throw validationError('Unsupported filter operator')
        values.push(bind(operand))
        return `${field} ${comparison} ?`
      }).join(' AND ')
    }
    values.push(bind(value))
    return `${field} = ?`
  }).join(' AND ') || '1'
  return { sql: visit(filter), values }
}

function normalize(model, input) {
  const result = {}
  for (const [field, spec] of Object.entries(model.fields)) {
    let value = input[field]
    if (value === undefined) value = typeof spec.default === 'function' ? spec.default() : spec.default ?? null
    if (spec.required && (value === null || value === '')) throw validationError(`${field} is required`)
    if (value !== null) {
      if (spec.type === 'text') {
        if (typeof value !== 'string') throw validationError(`${field} must be text`)
        if (spec.trim !== false) value = value.trim()
        if (spec.lowercase) value = value.toLowerCase()
        if (spec.required && !value) throw validationError(`${field} is required`)
        if (spec.max && value.length > spec.max) throw validationError(`${field} is too long`)
        if (spec.enum && !spec.enum.includes(value)) throw validationError(`${field} is invalid`)
      } else if (spec.type === 'number') {
        if (!['number', 'string'].includes(typeof value) || value === '' || !Number.isFinite(Number(value))) throw validationError(`${field} must be a finite number`)
        value = Number(value)
        if (value < spec.min || (spec.integer && !Number.isInteger(value))) throw validationError(`${field} is out of range`)
      } else if (spec.type === 'boolean') {
        if (typeof value !== 'boolean') throw validationError(`${field} must be true or false`)
      } else if (spec.type === 'reference') {
        if (!isValidId(value)) throw validationError(`${field} must be a valid ID`)
      } else if (spec.type === 'date') {
        value = new Date(value)
        if (!Number.isFinite(value.getTime())) throw validationError(`${field} must be a valid date`)
      }
    }
    result[field] = value
  }
  if (model.table === 'users') {
    const farms = input.assignedFarmIds ?? []
    if (!Array.isArray(farms) || farms.some(id => !isValidId(id))) throw validationError('Invalid farm assignments')
    result.assignedFarmIds = [...new Set(farms)]
  }
  if (model.table === 'farms' && result.cropAreaHectares + result.livestockAreaHectares + result.otherAreaHectares > result.sizeHectares) throw validationError('Allocated areas cannot exceed total farm size')
  return result
}

class Document {
  constructor(model, data) {
    Object.assign(this, data)
    Object.defineProperties(this, {
      model: { value: model },
      original: { value: structuredClone(data), writable: true }
    })
  }
  get id() { return this._id }
  toObject() { return { ...this } }
  toJSON() { return this.toObject() }
  save() {
    const current = this.model.rawById(this._id)
    if (!current) throw validationError('Record no longer exists')
    for (const [field, value] of Object.entries(this)) {
      if (JSON.stringify(value) !== JSON.stringify(this.original[field])) current[field] = value
    }
    const stored = this.model.write(current, false)
    // Preserve selected fields so private values are not added to a projected result.
    for (const field of Object.keys(this)) this[field] = stored[field]
    this.original = structuredClone(this.toObject())
    return this
  }
  deleteOne() { return this.model.deleteOne({ _id: this._id }) }
}

class Query {
  constructor(model, filter, single = false) { this.model = model; this.filter = filter; this.single = single; this.joins = []; this.order = {}; this.fields = ''; this.maximum = null }
  select(fields) { this.fields = fields; return this }
  sort(order) { this.order = order; return this }
  limit(maximum) { this.maximum = maximum; return this }
  lean() { this.plain = true; return this }
  populate(field, fields) { this.joins.push([field, fields]); return this }
  exec() {
    const condition = where(this.model, this.filter)
    let sql = `SELECT * FROM ${quote(this.model.table)} WHERE ${condition.sql}`
    const ordered = Object.entries(this.order).filter(([field]) => ['_id', 'createdAt', 'updatedAt', ...Object.keys(this.model.fields)].includes(field))
    if (ordered.length) sql += ` ORDER BY ${ordered.map(([field, direction]) => `${quote(field)} ${direction === -1 ? 'DESC' : 'ASC'}`).join(', ')}`
    if (this.single || this.maximum !== null) { sql += ' LIMIT ?'; condition.values.push(this.single ? 1 : this.maximum) }
    const rows = getDatabase().prepare(sql).all(...condition.values)
    const result = rows.map(row => {
      const data = this.model.hydrate(row)
      const requested = this.fields.split(/\s+/).filter(Boolean)
      const includes = requested.filter(field => !field.startsWith('+') && !field.startsWith('-'))
      for (const field of Object.keys(data)) {
        if ((includes.length && field !== '_id' && !includes.includes(field)) || requested.includes(`-${field}`) || (this.model.fields[field]?.hidden && !requested.includes(`+${field}`) && !includes.includes(field))) delete data[field]
      }
      for (const [field, fields] of this.joins) {
        const spec = this.model.fields[field]
        if (data[field] && spec?.table) data[field] = repository(spec.table).findById(data[field]).select(fields).lean().exec()
      }
      return this.plain ? data : new Document(this.model, data)
    })
    return this.single ? result[0] ?? null : result
  }
  then(resolve, reject) { return Promise.resolve().then(() => this.exec()).then(resolve, reject) }
}

function repository(table) {
  if (repositories.has(table)) return repositories.get(table)
  const fields = schemas[table]
  if (!fields) throw new Error('Unknown repository')
  const model = {
    table, fields,
    hydrate(row) {
      const data = { ...row }
      for (const [field, spec] of Object.entries(fields)) {
        if (data[field] !== null && spec.type === 'date') data[field] = new Date(data[field])
        if (data[field] !== null && spec.type === 'boolean') data[field] = Boolean(data[field])
      }
      if (table === 'users') data.assignedFarmIds = getDatabase().prepare('SELECT farmId FROM user_farms WHERE userId = ? ORDER BY farmId').all(data._id).map(row => row.farmId)
      return data
    },
    rawById(id) { const row = getDatabase().prepare(`SELECT * FROM ${quote(table)} WHERE _id = ?`).get(id); return row ? this.hydrate(row) : null },
    write(input, insert) {
      const db = getDatabase()
      try {
        return db.transaction(() => {
          const data = normalize(this, input)
          const id = input._id || crypto.randomBytes(12).toString('hex')
          if (!isValidId(id)) throw validationError('Invalid record ID')
          const now = new Date().toISOString()
          const keys = Object.keys(fields)
          const values = keys.map(field => bind(data[field]))
          if (insert) db.prepare(`INSERT INTO ${quote(table)} (_id, createdAt, updatedAt, ${keys.map(quote).join(',')}) VALUES (${Array(keys.length + 3).fill('?').join(',')})`).run(id, input.createdAt ? new Date(input.createdAt).toISOString() : now, input.updatedAt ? new Date(input.updatedAt).toISOString() : now, ...values)
          else db.prepare(`UPDATE ${quote(table)} SET ${keys.map(key => `${quote(key)} = ?`).join(',')}, updatedAt = ? WHERE _id = ?`).run(...values, now, id)
          if (table === 'users') {
            db.prepare('DELETE FROM user_farms WHERE userId = ?').run(id)
            const assign = db.prepare('INSERT INTO user_farms (userId, farmId) VALUES (?, ?)')
            for (const farm of data.assignedFarmIds) assign.run(id, farm)
          }
          return this.rawById(id)
        })()
      } catch (error) { throw databaseError(error) }
    },
    create(input) {
      if (Array.isArray(input)) return getDatabase().transaction(() => input.map(item => this.create(item)))()
      return new Document(this, this.write(input, true))
    },
    find(filter = {}) { return new Query(this, filter) },
    findOne(filter = {}) { return new Query(this, filter, true) },
    findById(id) { return this.findOne({ _id: id }) },
    countDocuments(filter = {}) { const condition = where(this, filter); return getDatabase().prepare(`SELECT COUNT(*) AS count FROM ${quote(table)} WHERE ${condition.sql}`).get(...condition.values).count },
    exists(filter) { return Boolean(this.countDocuments(filter)) },
    distinct(field, filter) { const condition = where(this, filter); if (!['_id', ...Object.keys(fields)].includes(field)) throw validationError('Unknown field'); return getDatabase().prepare(`SELECT DISTINCT ${quote(field)} AS value FROM ${quote(table)} WHERE ${condition.sql}`).all(...condition.values).map(row => row.value) },
    deleteOne(filter) {
      return getDatabase().transaction(() => {
        const row = this.findOne(filter).exec()
        if (!row) return { deletedCount: 0 }
        try { getDatabase().prepare(`DELETE FROM ${quote(table)} WHERE _id = ?`).run(row._id) } catch (error) { throw databaseError(error) }
        return { deletedCount: 1 }
      })()
    },
    findOneAndDelete(filter) { return getDatabase().transaction(() => { const row = this.findOne(filter).exec(); if (row) this.deleteOne({ _id: row._id }); return row })() },
    findOneAndUpdate(filter, update) {
      return getDatabase().transaction(() => {
        const condition = where(this, filter)
        const row = getDatabase().prepare(`SELECT * FROM ${quote(table)} WHERE ${condition.sql} LIMIT 1`).get(...condition.values)
        if (!row) return null
        const data = this.hydrate(row)
        Object.assign(data, update.$set)
        for (const [field, value] of Object.entries(update.$inc || {})) data[field] = (data[field] || 0) + value
        for (const field of Object.keys(update.$unset || {})) data[field] = null
        return new Document(this, this.write(data, false))
      })()
    },
    summarize(filter, { groupBy, sums = {}, count = false } = {}) {
      const condition = where(this, filter)
      const column = field => { if (!Object.hasOwn(fields, field)) throw validationError('Unknown summary field'); return quote(field) }
      const expressions = [groupBy ? `${column(groupBy)} AS _id` : 'NULL AS _id']
      if (count) expressions.push('COUNT(*) AS count')
      for (const [alias, field] of Object.entries(sums)) { if (!/^\w+$/.test(alias)) throw validationError('Invalid summary alias'); expressions.push(`COALESCE(SUM(${column(field)}), 0) AS ${quote(alias)}`) }
      return getDatabase().prepare(`SELECT ${expressions.join(',')} FROM ${quote(table)} WHERE ${condition.sql}${groupBy ? ` GROUP BY ${column(groupBy)}` : ''}`).all(...condition.values)
    },
    monthlyTotals(filter) {
      const condition = where(this, filter)
      return getDatabase().prepare(`SELECT substr(date, 1, 7) AS _id, SUM(amount) AS total FROM ${quote(table)} WHERE ${condition.sql} GROUP BY substr(date, 1, 7)`).all(...condition.values)
    },
    periodTotals(filter, currentMonthStart) {
      const condition = where(this, filter)
      return getDatabase().prepare(`SELECT COALESCE(SUM(CASE WHEN date >= ? THEN amount ELSE 0 END), 0) AS currentMonth, COALESCE(SUM(CASE WHEN date < ? THEN amount ELSE 0 END), 0) AS previousMonth FROM ${quote(table)} WHERE ${condition.sql}`).all(bind(currentMonthStart), bind(currentMonthStart), ...condition.values)
    }
  }
  repositories.set(table, model)
  return model
}
module.exports = repository
