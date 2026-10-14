const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const dotenv = require('dotenv')
const path = require('path')
const authroutes = require('./routes/authroutes')
const dashboardroutes = require('./routes/dashboardroutes')
const farmroutes = require('./routes/farmroutes')
const recordroutes = require('./routes/recordroutes')
const routineroutes = require('./routes/routineroutes')
const userroutes = require('./routes/userroutes')

dotenv.config()

const app = express()
const port = Number(process.env.PORT) || 5000

app.use(cors())
app.use(express.json({ limit: '3mb' }))
app.use('/api/profile-pictures', express.static(
  path.resolve(__dirname, './uploads/profile-pictures'),
  { maxAge: '7d', immutable: true }
))

app.get('/', (req, res) => {
  res.json({
    message: 'Agro Livestock API is running'
  })
})

let databaseConnection

const connectDatabase = async () => {
  if (mongoose.connection.readyState === 1) return
  if (!databaseConnection) {
    databaseConnection = mongoose.connect(process.env.MONGO_URI).catch((error) => {
      databaseConnection = undefined
      throw error
    })
  }
  await databaseConnection
}

app.use(async (req, res, next) => {
  const missingSettings = ['MONGO_URI', 'JWT_SECRET', 'ADMIN_EMAIL'].filter(
    (setting) => !process.env[setting]
  )
  if (missingSettings.length) {
    return res.status(503).json({
      message: `Backend configuration is incomplete: ${missingSettings.join(', ')}`
    })
  }
  if (Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
    return res.status(503).json({ message: 'Backend JWT configuration is invalid' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL.trim())) {
    return res.status(503).json({ message: 'Backend administrator configuration is invalid' })
  }
  try {
    await connectDatabase()
    return next()
  } catch (error) {
    console.error('Unable to connect to MongoDB:', error.name, error.code || 'connection failed')
    return res.status(503).json({ message: 'Database is unavailable. Check the backend MongoDB configuration.' })
  }
})

app.use('/api/auth', authroutes)
app.use('/api/dashboard', dashboardroutes)
app.use('/api/farms', farmroutes)
app.use('/api/records', recordroutes)
app.use('/api/routines', routineroutes)
app.use('/api/users', userroutes)

const startServer = async () => {
  const missingSettings = ['MONGO_URI', 'JWT_SECRET', 'ADMIN_EMAIL'].filter(
    (setting) => !process.env[setting]
  )

  if (missingSettings.length) {
    throw new Error(`Missing required backend settings: ${missingSettings.join(', ')}`)
  }

  if (Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes')
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL.trim())) {
    throw new Error('ADMIN_EMAIL must be a valid email address')
  }

  await connectDatabase()
  console.log('MongoDB connected successfully')

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`)
  })
}

if (require.main === module) {
  startServer().catch((error) => {
    const safeMessage =
      error.message.startsWith('Missing required backend settings:') ||
      error.message.startsWith('JWT_SECRET must')
        ? error.message
        : error.code || 'Check the MongoDB network and access settings'
    console.error('Backend startup failed:', error.name, safeMessage)
    process.exitCode = 1
  })
}

module.exports = app