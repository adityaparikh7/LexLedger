import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled with the app (not loaded from Google Fonts) so it works offline
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import AuthGate from './auth/AuthGate'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
