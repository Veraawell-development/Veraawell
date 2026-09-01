import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { installCsrfFetchInterceptor } from './utils/csrfFetchInterceptor'

// Must run before any other code makes a fetch() call — see
// csrfFetchInterceptor.ts for why this exists (CSRF protection).
installCsrfFetchInterceptor()
console.info(
  "%c VERAAWELL %c Developed by Abhigyan ( IIIT Delhi 27 ) ",
  "background: #0f172a; color: #ffffff; padding: 6px 12px; border-radius: 4px 0 0 4px; font-weight: 900; font-family: monospace; font-size: 11px; letter-spacing: 1px;",
  "background: #14b8a6; color: #ffffff; padding: 6px 12px; border-radius: 0 4px 4px 0; font-family: monospace; font-size: 11px;"
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

import { HelmetProvider } from 'react-helmet-async';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
)
