import { runGoogleConsentFlow } from "./oauth-google.js";

runGoogleConsentFlow().catch((err) => {
  console.error("Google consent flow failed:", err);
  process.exit(1);
});
