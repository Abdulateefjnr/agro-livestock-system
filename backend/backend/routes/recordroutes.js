const express = require('express')
const {
  createRecord,
  deleteRecord,
  listRecords,
  updateRecord
} = require('../controllers/recordcontroller')
const authenticate = require('../middleware/authmiddleware')
const { requireRecordPermission } = require('../middleware/permissions')

const router = express.Router()

router.use(authenticate)
router.get('/:type', requireRecordPermission('read'), listRecords)
router.post('/:type', requireRecordPermission('write'), createRecord)
router.put('/:type/:id', requireRecordPermission('write'), updateRecord)
router.delete('/:type/:id', requireRecordPermission('write'), deleteRecord)

module.exports = router
