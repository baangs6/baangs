import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys

async def test_conn():
    uri = "mongodb+srv://baangstech_db_user:snb3GBioBO43KMSK@baangs.fejxabn.mongodb.net/baangs_fsm?retryWrites=true&w=majority&appName=baangs"
    print(f"Connecting to {uri}...")
    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
    try:
        # The ismaster command is cheap and does not require auth.
        await client.admin.command('ismaster')
        print("✅ MongoDB connection successful!")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(test_conn())
