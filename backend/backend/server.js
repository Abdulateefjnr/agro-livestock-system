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

const getConfigurationError = () => {
  const missingSettings = ['MONGO_URI', 'JWT_SECRET', 'ADMIN_EMAIL'].filter(
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
  const configurationError = getConfigurationError()
  if (configurationError) {
    return res.status(503).json({ message: configurationError })
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


const startServer = () => {
  const configurationError = getConfigurationError();

  if (configurationError) {
    console.error(configurationError);
    process.exitCode = 1;
    return;
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);

    connectDatabase()
      .then(() => {
        console.log('MongoDB connected successfully');
      })
      .catch(() => {
        console.error(
          'Backend is listening, but MongoDB is unavailable.'
        );
      });
  });

  server.on('error', (error) => {
    console.error(
      'Backend server error:',
      error.code || error.message
    );
    process.exitCode = 1;
  });
};


if (require.main === module) {
  startServer();
}

module.exports = app;