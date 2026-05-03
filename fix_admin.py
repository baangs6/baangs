import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys
import os

# Add backend to path for hashing
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.auth.utils import hash_password

async def fix_admin():
    uri = "mongodb+srv://baangstech_db_user:snb3GBioBO43KMSK@baangs.fejxabn.mongodb.net/baangs_fsm?retryWrites=true&w=majority&appName=baangs"
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    
    username = "sahil"
    password = "password123"
    
    new_hash = hash_password(password)
    print(f"Updating admin {username} password...")
    
    result = await db.users.update_one(
        {"username": username},
        {"$set": {"password_hash": new_hash, "role": "admin", "status": "active"}}
    )
    
    if result.modified_count > 0:
        print("✅ Admin password reset successful!")
    else:
        # If user doesn't exist, create it
        user = await db.users.find_one({"username": username})
        if not user:
             print("User not found, creating admin...")
             from app.utils.id_generator import generate_user_id
             from app.utils.timezone import now_ist_str
             await db.users.insert_one({
                "user_id": "USR001",
                "username": username,
                "password_hash": new_hash,
                "role": "admin",
                "status": "active",
                "full_name": "Sahil Satheesh",
                "created_at": now_ist_str()
             })
             print("✅ Admin created!")
        else:
             print("ℹ️ Password already set.")
             
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_admin())
