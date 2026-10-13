import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from app.auth.utils import hash_password

async def reset():
    uri = os.environ["MONGODB_URL"]
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    hashed = hash_password(os.environ["RESET_PASSWORD"])
    result = await db.users.update_one(
        {'username': 'sarun'},
        {'$set': {
            'password_hash': hashed,
            'role': 'technician',
            'status': 'active',
            'staff_id': 'STF-SARUN01',
            'full_name': 'Sarun Technician'
        }}
    )
    print('Modified users:', result.modified_count)

    # Delete all attendance records for STF-SARUN01 to ensure clean test state
    att_del = await db.attendance.delete_many({'staff_id': 'STF-SARUN01'})
    print('Deleted attendance entries:', att_del.deleted_count)

    staff = await db.staff.find_one({'staff_id': 'STF-SARUN01'})
    if not staff:
        await db.staff.insert_one({
            'staff_id': 'STF-SARUN01',
            'full_name': 'Sarun Technician',
            'name': 'Sarun Technician',
            'role': 'technician',
            'username': 'sarun',
            'status': 'active',
            'is_active': True,
            'daily_allowance': 200.0,
            'salary': 25000.0
        })
        print('Created STF-SARUN01 staff record')
    else:
        await db.staff.update_one(
            {'staff_id': 'STF-SARUN01'},
            {'$set': {'username': 'sarun', 'status': 'active', 'is_active': True, 'name': 'Sarun Technician', 'full_name': 'Sarun Technician'}}
        )
        print('Updated STF-SARUN01 staff record')

    client.close()

if __name__ == '__main__':
    asyncio.run(reset())
