import '@testing-library/jest-dom';

// Polyfill TextEncoder/TextDecoder for jest-environment-jsdom
// (needed by isomorphic-dompurify's bundled jsdom via whatwg-url)
import { TextEncoder, TextDecoder } from 'util';
Object.assign(global, { TextEncoder, TextDecoder });

// Mock environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SESSION_SECRET = 'test-session-secret-that-is-at-least-32-chars-long';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.OPENAI_API_KEY = 'test-openai-key';
