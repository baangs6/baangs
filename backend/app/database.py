from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings
from .mock_database import create_mock_database

client: AsyncIOMotorClient = None
db = None
db_mode = "disconnected"


async def connect_db():
    global client, db, db_mode

    try:
        mongo_client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
        )
        await mongo_client.admin.command("ping")

        client = mongo_client
        db = client[settings.DATABASE_NAME]
        await create_indexes()
        db_mode = "mongo"
        print(f"[OK] Connected to MongoDB: {settings.DATABASE_NAME}")
    except Exception as exc:
        client = None
        if not settings.ALLOW_MOCK_DATABASE:
            db = None
            db_mode = "disconnected"
            raise
        db = create_mock_database()
        db_mode = "mock"
        print(f"[WARN] MongoDB unavailable, using local mock database instead: {exc}")


async def close_db():
    global client, db_mode
    if client and db_mode == "mongo":
        client.close()
        print("[OK] MongoDB connection closed")


async def create_indexes():
    # Users
    await db.users.create_index("username", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    if await db.users.count_documents({"role": "admin"}) > 0:
        await db.setup_state.update_one(
            {"_id": "initial_admin"},
            {"$setOnInsert": {"completed": True}},
            upsert=True,
        )
    # Staff
    await db.staff.create_index("phone_number")
    # Customers
    await db.customers.create_index("phone_number")
    await db.customers.create_index("customer_key", unique=True)
    await db.amc_contracts.create_index("amc_id", unique=True)
    await db.quotations.create_index("quote_id", unique=True)
    await db.quotations.create_index([("customer_id", 1), ("quote_date", -1)])
    await db.amc_contracts.create_index([("customer_id", 1), ("start_date", 1)])
    # Jobs
    await db.jobs.create_index("job_id", unique=True)
    await db.jobs.create_index([("customer_id", 1), ("status", 1)])
    await db.jobs.create_index("assigned_staff_id")
    # Daily Updates
    await db.daily_updates.create_index("job_id")
    # Attendance
    await db.attendance.create_index([("staff_id", 1), ("date", 1)])
    # Billing
    await db.billing.create_index("job_id", unique=True)


def get_db():
    return db


def get_db_mode():
    return db_mode
