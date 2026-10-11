import asyncio
from app.mock_database import MockDatabase
from app.routers.jobs import annotate_amc, _format_job
from app.utils.timezone import today_ist_str


def test_indicator_matches_location_and_does_not_consume_visits():
    async def run():
        db = MockDatabase()
        today = today_ist_str()
        await db.amc_contracts.insert_one({
            'amc_id': 'AMC-test', 'customer_id': 'C1', 'location': ' Main  Shop ',
            'start_date': today, 'end_date': today, 'visits': [{'free_service': True}] * 4,
        })
        jobs = [{'job_id': 'J1', 'customer_id': 'C1', 'location': 'main shop'},
                {'job_id': 'J2', 'customer_id': 'C1', 'location': 'other shop'}]
        await annotate_amc(db, jobs)
        assert _format_job(jobs[0])['amc_coverage']['free_visits_remaining'] == 0
        assert jobs[1]['amc_coverage'] is None
        contract = await db.amc_contracts.find_one({'amc_id': 'AMC-test'})
        assert len(contract['visits']) == 4
    asyncio.run(run())
