import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    uri = os.environ["MONGODB_URL"]
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    user = await db.users.find_one({"username": "chikku"})
    if user:
        h = user["password_hash"]
        print("Diagnostic completed without logging sensitive values")
        print(f"Length: {len(h)}")
    else:
        print("User not found")
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
