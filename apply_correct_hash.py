import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def update_hash():
    uri = os.environ["MONGODB_URL"]
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    
    username = "chikku"
    # This is the hash generated using the backend's own passlib logic
    correct_hash = os.environ["RESET_PASSWORD_HASH"]
    
    print(f"Updating hash for {username}...")
    result = await db.users.update_one(
        {"username": username},
        {"$set": {"password_hash": correct_hash, "status": "active"}}
    )
    
    if result.modified_count > 0:
        print("✅ Correct hash applied!")
    else:
        print("ℹ️ Hash was already correct or update failed.")
        
    client.close()

if __name__ == "__main__":
    asyncio.run(update_hash())
