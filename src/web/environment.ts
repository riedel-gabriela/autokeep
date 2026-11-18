// Vite only exposes this public URL. Never expose AWS_* as VITE_* variables.
export const mailpitUrl = import.meta.env.DEV
  ? import.meta.env.VITE_MAILPIT_URL || 'http://localhost:8025'
  : null;
export const localDevelopment = import.meta.env.DEV;
