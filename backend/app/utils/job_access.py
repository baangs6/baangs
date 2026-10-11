def technician_job_filter(staff_id):
    if not staff_id:
        return {"job_id": {"$in": []}}
    return {"$or": [{"assigned_staff_id": staff_id}, {"additional_staff_ids": staff_id}]}


def is_assigned_to_job(job, staff_id):
    return bool(staff_id and (job.get("assigned_staff_id") == staff_id or staff_id in (job.get("additional_staff_ids") or [])))
