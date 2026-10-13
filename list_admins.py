import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def get_admins():
    uri = os.environ["MONGODB_URL"]
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    print("Finding admins...")
    cursor = db.users.find({"role": "admin"}).limit(5)
    async for user in cursor:
        print(f"Username: {user['username']}, Full Name: {user.get('full_name', 'N/A')}")
    client.close()

if __name__ == "__main__":
    asyncio.run(get_admins())
