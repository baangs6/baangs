import asyncio
from app.database import connect_db, get_db
from app.utils.timezone import today_ist_str

async def check():
    await connect_db()
    db = get_db()
    jobs = await db.jobs.find({}).to_list(100)
    print(f"Total jobs in DB: {len(jobs)}")
    for j in jobs:
        print(f"ID: {j.get('job_id')}, Status: {j.get('status')}, Assigned: {j.get('assigned_staff_id')}, Date: {j.get('scheduled_date')}")

if __name__ == "__main__":
    asyncio.run(check())
