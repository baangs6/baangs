# Baangs API Download-Ready Guide

This lets you use and share the API now, without publishing mobile apps to app stores.

## 1) What is ready
- OpenAPI schema: `baangs_openapi.json`
- Postman collection: `Baangs_API_Postman_Collection.json`
- Backend server: FastAPI on `http://127.0.0.1:8000`

## 2) Start API locally
From `backend/`:

```powershell
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

API docs:
- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI JSON (live): `http://127.0.0.1:8000/openapi.json`

## 3) Download/share API artifacts
- `baangs_openapi.json` (import to Swagger/Postman/Insomnia)
- `Baangs_API_Postman_Collection.json` (import directly in Postman)

## 4) If mobile app is on another device
You need a public or LAN API URL:

### Option A: Same Wi-Fi LAN
Run backend with:
```powershell
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Then use:
`http://<your-pc-lan-ip>:8000`

### Option B: Public temporary URL (tunnel)
Use Cloudflare Tunnel / ngrok and point app API base URL to tunnel URL.

## 5) Mobile app API URL setting
Set mobile env:
- `EXPO_PUBLIC_API_URL=http://<host>:8000`

## 6) Security notes before sharing
- Rotate Cloudinary API secret if it was shared publicly.
- Use strong JWT `SECRET_KEY` in backend `.env`.
- Restrict CORS origins when moving beyond local testing.
