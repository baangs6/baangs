import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt

async def reset():
    uri = 'mongodb+srv://baangstech_db_user:snb3GBioBO43KMSK@baangs.fejxabn.mongodb.net/baangs_fsm?retryWrites=true&w=majority&appName=baangs'
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw('password123'.encode('utf-8'), salt).decode('utf-8')
    result = await db.users.update_one({'username': 'sarun'}, {'$set': {'password_hash': hashed}})
    print('Modified:', result.modified_count)
    user = await db.users.find_one({'username': 'sarun'})
    print('User role:', user.get('role'), '| Status:', user.get('status'))
    client.close()

asyncio.run(reset())
