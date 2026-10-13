const express = require('express')
const authenticate = require('../middleware/authmiddleware')
const {
  createRoutine,
  deleteRoutine,
  listRoutines,
  updateRoutine
} = require('../controllers/routinecontroller')

const router = express.Router()

router.use(authenticate)
router.route('/').get(listRoutines).post(createRoutine)
router.route('/:id').patch(updateRoutine).delete(deleteRoutine)

module.exports = router
