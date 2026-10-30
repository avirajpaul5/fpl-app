import '@fontsource-variable/geist';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { TooltipProvider } from '@/components/ui/tooltip.tsx';
import { ThemeProvider } from '@/components/theme-provider.tsx';
import { MotionConfig } from 'motion/react';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min default
      retry: 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider>
            {/* Respect the OS "reduce motion" setting for every animation. */}
            <MotionConfig reducedMotion="user">
              <App />
            </MotionConfig>
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
