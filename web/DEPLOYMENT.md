# Clean URL deployment on Render

Before deploying BrowserRouter, open the existing baangs-web static site in
Render and add this rule under Redirects/Rewrites:

| Source | Destination | Action |
| --- | --- | --- |
| /* | /index.html | Rewrite |

Use Rewrite, not Redirect. This serves the app for direct links and refreshes
such as /complaint, /track, and /jobs/JOB-123 while preserving the URL.
This document does not automatically configure the Render service.

After deployment, verify https://baangs.site/complaint opens and refreshes
without a 404. Existing /#/complaint links are converted by the app.
