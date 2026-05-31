import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AiEraKbAutoBridge from './components/AiEraKbAutoBridge.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AiEraKbAutoBridge />
    <App />
  </StrictMode>,
);
