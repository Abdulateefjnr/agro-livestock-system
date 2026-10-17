const path = require('path')
module.exports = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads/profile-pictures'))
