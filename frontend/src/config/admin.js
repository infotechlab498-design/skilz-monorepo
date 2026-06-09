export const ADMIN_EMAIL = String(
  import.meta.env.VITE_ADMIN_EMAIL || 'info@aljazeeragc.com'
)
  .toLowerCase()
  .trim();

