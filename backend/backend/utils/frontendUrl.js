const createFrontendUrl = (path) => {
  const baseUrl = new URL(process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL)
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/`
  return new URL(path.replace(/^\/+/, ''), baseUrl)
}

module.exports = createFrontendUrl
