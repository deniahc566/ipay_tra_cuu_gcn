// Environment variables required by the application — set before any module imports
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-chars-long!!";
process.env.SESSION_PASSWORD = "test-session-pwd-that-is-at-least-32-chars!!";
process.env.VBI_API_KEY = "test-vbi-api-key";
process.env.VBI_CANCEL_API_KEY = "test-vbi-cancel-api-key";
process.env.ALLOWED_EMAIL_DOMAIN = "vbi.com.vn";
process.env.GMAIL_USER = "test@gmail.com";
process.env.GMAIL_APP_PASSWORD = "test-app-password";
process.env.MOTHERDUCK_TOKEN = "test-motherduck-token";
process.env.CANCEL_ALLOWED_EMAILS = "cancel@vbi.com.vn";
process.env.ADMIN_EMAILS = "admin@vbi.com.vn";
