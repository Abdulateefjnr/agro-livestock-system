const express = require('express')
const {
  getDashboardSummary,
  getFinancialMonitoring
} = require('../controllers/dashboardcontroller')
const authenticate = require('../middleware/authmiddleware')

const router = express.Router()

router.get('/summary', authenticate, getDashboardSummary)
router.get('/monitoring', authenticate, getFinancialMonitoring)

module.exports = router
