const express = require('express')
const cors = require('cors')
const { getDatabase, closeDatabase } = require('./database')
const dotenv = require('dotenv')
const path = require('path')
if (process.env.NODE_ENV !== 'test') dotenv.config({ path: path.join(__dirname, '.env') })
const authroutes = require('./routes/authroutes')
const dashboardroutes = require('./routes/dashboardroutes')
const farmroutes = require('./routes/farmroutes')
const recordroutes = require('./routes/recordroutes')
const routineroutes = require('./routes/routineroutes')
const userroutes = require('./routes/userroutes')


const app = express()
const port = Number(process.env.PORT) || 5000
const helmet = require('helmet')
const { rateLimit } = require('express-rate-limit')
const bootstrapAdmin = require('./utils/bootstrapAdmin')
const seedDemoData = require('./utils/seedDemoData')
const profileDirectory = require('./utils/profileDirectory')
let initialized = false

app.disable('x-powered-by')
// Render runs one reverse proxy in front of this service.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    "font-src": ["'self'", 'https://fonts.gstatic.com', 'data:'],
    "img-src": ["'self'", 'data:', 'https:'],
    "connect-src": ["'self'", 'https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com'],
    "upgrade-insecure-requests": process.env.NODE_ENV === 'production' ? [] : null
  }
} }))
app.use(cors({ origin: process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173' }))
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again later.' }
}))
app.use(express.json({ limit: '3mb' }))
app.use('/api/profile-pictures', express.static(
  profileDirectory,
  { maxAge: '7d', immutable: true }
))

let databaseConnection

const getConfigurationError = () => {
  const missingSettings = ['JWT_SECRET', 'ADMIN_EMAIL'].filter(
    (setting) => !process.env[setting]
  )
  if (missingSettings.length) {
    return `Backend configuration is incomplete: ${missingSettings.join(', ')}`
  }
  if (Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
    return 'Backend JWT configuration is invalid'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL.trim())) {
    return 'Backend administrator configuration is invalid'
  }
}

const connectDatabase = async () => {
  getDatabase()
  if (initialized) return
  if (!databaseConnection) {
    databaseConnection = bootstrapAdmin().then(admin => { seedDemoData(admin); initialized = true }).catch(error => {
      databaseConnection = undefined
      throw error
    })
  }
  await databaseConnection
}

app.use(['/api', '/healthz'], async (req, res, next) => {
  const configurationError = getConfigurationError()
  if (configurationError) {
    return res.status(503).json({ message: configurationError })
  }
  try {
    await connectDatabase()
    return next()
  } catch (error) {
    console.error('Unable to open SQLite database:', error.name, error.code || 'connection failed')
    return res.status(503).json({ message: 'Database is unavailable. Check the backend storage configuration.' })
  }
})

app.get('/healthz', async (req, res) => {
  try {
    getDatabase().prepare('SELECT 1').get()
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'unavailable' })
  }
})

app.use('/api/auth', authroutes)
app.use('/api/dashboard', dashboardroutes)
app.use('/api/farms', farmroutes)
app.use('/api/records', recordroutes)
app.use('/api/routines', routineroutes)
app.use('/api/users', userroutes)


app.use('/api', (req, res) => res.status(404).json({ message: 'API endpoint not found' }))
const frontendDirectory = path.resolve(__dirname, '../../dist')
app.use(express.static(frontendDirectory))
app.get('/{*path}', (req, res, next) => {
  if (path.extname(req.path)) return next()
  res.sendFile(path.join(frontendDirectory, 'index.html'))
})
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  const status = error.status === 413 ? 413 : error.type === 'entity.parse.failed' ? 400 : 500
  if (status === 500) console.error('Request failed:', error.name)
  return res.status(status).json({ message: status === 413 ? 'Request is too large' : status === 400 ? 'Invalid JSON request' : 'Request failed' })
})

const startServer = async () => {
  try {
    const configurationError = getConfigurationError()
    if (configurationError) throw new Error(configurationError)
    await connectDatabase()
    const server = app.listen(port, '0.0.0.0', () => console.log(`Server listening on port ${port}`))
    const shutdown = () => {
      server.close(async () => { closeDatabase(); process.exit(0) })
      setTimeout(() => process.exit(1), 10000).unref()
    }
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
    server.on('error', (error) => { console.error('Server error:', error.code); process.exitCode = 1 })
  } catch (error) {
    console.error('Startup failed:', error.message)
    closeDatabase()
    process.exitCode = 1
  }
}
if (require.main === module) startServer()
module.exports = app
