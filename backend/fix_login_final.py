import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys
import os

# Add current directory to path so we can import app
sys.path.append(os.getcwd())

from app.auth.utils import hash_password

async def fix_login():
    uri = os.environ["MONGODB_URL"]
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    
    username = "chikku"
    password = os.environ["RESET_PASSWORD"]
    
    new_hash = hash_password(password)
    print("Diagnostic completed without logging sensitive values")
    print(f"Hash length: {len(new_hash)}")
    
    if len(new_hash) < 60:
        print("⚠️ Warning: Hash seems too short!")
    
    result = await db.users.update_one(
        {"username": username},
        {"$set": {"password_hash": new_hash, "status": "active"}}
    )
    
    if result.modified_count > 0:
        print("✅ Password hash updated successfully using backend logic!")
    else:
        print("ℹ️ Update skipped (maybe hash was already identical).")
        
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_login())
