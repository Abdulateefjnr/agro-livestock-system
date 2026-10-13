import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applySavedAppearance } from './lib/appearance'
import './index.css'
import App from './App.tsx'

applySavedAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
