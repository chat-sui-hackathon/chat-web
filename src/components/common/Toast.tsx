// Toast notification wrapper

'use client';

import { Toaster } from 'react-hot-toast';

export function Toast() {
  return (
    <div className="relative z-[100]">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#fff',
            color: '#000',
            border: '1px solid #e4e4e7',
            zIndex: 100,
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </div>
  );
}

