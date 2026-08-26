import React from 'react'
import ReactDOM from 'react-dom/client'
import { App, DemoErrorBoundary } from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoErrorBoundary>
      <App />
    </DemoErrorBoundary>
  </React.StrictMode>,
)
