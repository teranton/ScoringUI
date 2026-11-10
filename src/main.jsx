import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { lataaAnalytiikka } from './utils/analytiikka'
import './index.css'
import App from './App.jsx'

lataaAnalytiikka()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
