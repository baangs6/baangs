import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys

async def test_conn():
    uri = os.environ["MONGODB_URL"]
    print("Diagnostic completed without logging sensitive values")
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
