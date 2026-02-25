/**
 * App configuration. API_URL is used for backend calls (Generate Selects, etc.).
 * - In dev: Set API_URL in .env.local (e.g. http://localhost:3001)
 * - For distributed app: Replace the URL below with your Railway URL before building
 */
const FALLBACK_API_URL = 'https://ai-video-app-production.up.railway.app';

export function getApiUrl() {
  return process.env.API_URL?.trim() || FALLBACK_API_URL;
}
