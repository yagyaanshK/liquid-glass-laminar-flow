import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const base = import.meta.env.BASE_URL;
document.documentElement.style.setProperty('--bg-url', `url('${base}bg.jpg')`);
document.documentElement.style.setProperty('--bg-url-landscape', `url('${base}bg-landscape.jpg')`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
