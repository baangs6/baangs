import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def get_users():
    uri = "mongodb+srv://baangstech_db_user:snb3GBioBO43KMSK@baangs.fejxabn.mongodb.net/baangs_fsm?retryWrites=true&w=majority&appName=baangs"
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    print("Finding technicians...")
    cursor = db.users.find({"role": "technician"}).limit(5)
    async for user in cursor:
        print(f"Username: {user['username']}, Full Name: {user.get('full_name', 'N/A')}")
    
    print("\nFinding admins...")
    cursor = db.users.find({"role": "admin"}).limit(5)
    async for user in cursor:
        print(f"Username: {user['username']}, Full Name: {user.get('full_name', 'N/A')}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(get_users())
