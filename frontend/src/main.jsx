import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import App from './App.jsx';
import './index.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function MissingAuthConfiguration() {
  return <main className="login-screen"><section className="login-card"><div className="brand-lockup"><span>PhishGuard</span></div><h1>Authentication needs setup</h1><p>Add your Clerk publishable key as <strong>VITE_CLERK_PUBLISHABLE_KEY</strong> in the root environment file, then restart the frontend.</p></section></main>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {publishableKey
      ? <ClerkProvider publishableKey={publishableKey}><App /></ClerkProvider>
      : <MissingAuthConfiguration />}
  </React.StrictMode>,
);
