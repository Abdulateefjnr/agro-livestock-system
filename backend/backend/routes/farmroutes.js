const express = require('express')
const authenticate = require('../middleware/authmiddleware')
const requireRole = require('../middleware/requireRole')
const {
  createFarm,
  deleteFarm,
  listFarms,
  updateFarm
} = require('../controllers/farmcontroller')

const router = express.Router()

router.use(authenticate)
router.get('/', listFarms)
router.post('/', requireRole('admin'), createFarm)
router.put('/:id', requireRole('admin', 'manager'), updateFarm)
router.delete('/:id', requireRole('admin'), deleteFarm)

module.exports = router
