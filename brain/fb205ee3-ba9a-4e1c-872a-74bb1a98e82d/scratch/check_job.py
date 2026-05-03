import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    uri = "mongodb+srv://baangstech_db_user:snb3GBioBO43KMSK@baangs.fejxabn.mongodb.net/baangs_fsm?retryWrites=true&w=majority&appName=baangs"
    client = AsyncIOMotorClient(uri)
    db = client.baangs_fsm
    job = await db.jobs.find_one({"customer_name": "Ragitha"})
    if job:
        print(f"Job found: {job['job_id']}")
    else:
        print("Job not found")
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
