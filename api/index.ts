import { app } from "../server/index.js";

// Keep authentication, sessions, CSRF and tenant checks in the existing API.
// Vercel routes /api/* here and invokes Express without opening a listener.
export default app;
