import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt

async def reset_password():
    uri = "mongodb+srv://baangstech_db_user:snb3GBioBO43KMSK@baangs.fejxabn.mongodb.net/baangs_fsm?retryWrites=true&w=majority&appName=baangs"
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    
    username = "sarun"
    new_password = "password123"
    
    # Simple bcrypt hashing
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(new_password.encode('utf-8'), salt).decode('utf-8')
    
    print(f"Resetting password for {username} to {new_password}...")
    
    result = await db.users.update_one(
        {"username": username},
        {"$set": {"password_hash": hashed}}
    )
    
    if result.modified_count > 0:
        print("✅ Password reset successful!")
    else:
        # Check if user exists
        user = await db.users.find_one({"username": username})
        if user:
            print("ℹ️ User found, but password was already the same (or update failed).")
        else:
            print("❌ User 'chikku' not found in database.")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(reset_password())
