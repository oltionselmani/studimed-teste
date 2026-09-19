'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          display: 'flex',
          minHeight: '100dvh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '1.25rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.4rem', fontWeight: 600 }}>ExamOS could not start this page.</h1>
        <p style={{ color: '#666', maxWidth: '28rem' }}>
          Nothing was saved. Try again, or restart the application.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: '#3949c9',
            color: '#fff',
            border: 0,
            borderRadius: '0.5rem',
            padding: '0.55rem 1rem',
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
