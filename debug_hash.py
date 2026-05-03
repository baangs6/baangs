import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    uri = "mongodb+srv://baangstech_db_user:snb3GBioBO43KMSK@baangs.fejxabn.mongodb.net/baangs_fsm?retryWrites=true&w=majority&appName=baangs"
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    user = await db.users.find_one({"username": "chikku"})
    if user:
        h = user["password_hash"]
        print(f"Hash: |{h}|")
        print(f"Length: {len(h)}")
    else:
        print("User not found")
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
