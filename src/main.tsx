import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CMDBApp } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CMDBApp />
  </StrictMode>,
);
