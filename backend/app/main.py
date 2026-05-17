from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

from .config import settings
from .database import connect_db, close_db, get_db, get_db_mode
from .utils.cloudinary_helper import configure_cloudinary
from .utils.job_reminders import job_reminder_loop
from .routers import auth, users, staff, customers, jobs, updates, billing, attendance, lookups, dashboard, export, inventory, notifications, leaves, tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    configure_cloudinary()
    reminder_task = asyncio.create_task(job_reminder_loop(get_db()))
    try:
        yield
    finally:
        reminder_task.cancel()
        try:
            await reminder_task
        except asyncio.CancelledError:
            pass
        await close_db()


app = FastAPI(
    title="Baangs FSM API",
    description="CCTV Field Service Management System",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:8081",
        "http://localhost:4174",
        "http://localhost:19006",
        "exp://localhost:8081",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(staff.router)
app.include_router(customers.router)
app.include_router(jobs.router)
app.include_router(updates.router)
app.include_router(billing.router)
app.include_router(attendance.router)
app.include_router(lookups.router)
app.include_router(dashboard.router)
app.include_router(export.router)
app.include_router(inventory.router)
app.include_router(notifications.router)
app.include_router(leaves.router)
app.include_router(tasks.router)


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "status": "running",
        "database_mode": get_db_mode(),
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "database_mode": get_db_mode()}
