from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional

from ..auth.utils import get_current_user
from ..database import get_db
from ..models.task import (
    SubTaskCreate,
    SubTaskUpdate,
    TaskCommentCreate,
    TaskCreate,
    TaskResponse,
    TaskStatus,
    TaskUpdate,
)
from ..utils.id_generator import generate_subtask_id, generate_task_comment_id, generate_task_id
from ..utils.notifications import notify_users
from ..utils.timezone import now_ist_str

router = APIRouter(prefix="/tasks", tags=["Tasks"])

TASK_ROLES = {"admin", "manager", "sales"}


def _require_task_user(current_user: dict):
    if current_user.get("role") not in TASK_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def _user_name(user: dict | None) -> str | None:
    if not user:
        return None
    return user.get("full_name") or user.get("username")


async def _active_task_users(db, user_ids: Optional[List[str]] = None):
    query = {"status": "active", "role": {"$in": list(TASK_ROLES)}}
    if user_ids is not None:
        query["user_id"] = {"$in": list(set(user_ids))}
    rows = await db.users.find(query, {"password_hash": 0}).to_list(1000)
    return rows


async def _validate_assignees(db, user_ids: List[str]) -> List[str]:
    clean_ids = list(dict.fromkeys([uid for uid in user_ids if uid]))
    if not clean_ids:
        return []
    rows = await _active_task_users(db, clean_ids)
    found = {row["user_id"] for row in rows}
    missing = [uid for uid in clean_ids if uid not in found]
    if missing:
        raise HTTPException(status_code=400, detail="One or more tagged users are invalid")
    return clean_ids


def _format_subtask(subtask: dict, users_by_id: dict) -> dict:
    assignee_ids = subtask.get("assignee_user_ids", [])
    return {
        "subtask_id": subtask["subtask_id"],
        "title": subtask["title"],
        "status": subtask.get("status", "pending"),
        "due_date": subtask.get("due_date"),
        "assignee_user_ids": assignee_ids,
        "assignee_names": [_user_name(users_by_id.get(uid)) or uid for uid in assignee_ids],
        "created_at": subtask.get("created_at"),
        "updated_at": subtask.get("updated_at"),
    }


async def _format_task(db, task: dict) -> dict:
    assignee_ids = task.get("assignee_user_ids", [])
    subtask_assignee_ids = []
    for subtask in task.get("subtasks", []):
        subtask_assignee_ids.extend(subtask.get("assignee_user_ids", []))
    user_ids = list(set(assignee_ids + subtask_assignee_ids + [task.get("created_by_user_id")]))
    users = await db.users.find({"user_id": {"$in": [uid for uid in user_ids if uid]}}, {"password_hash": 0}).to_list(1000)
    users_by_id = {user["user_id"]: user for user in users}
    return {
        "task_id": task["task_id"],
        "title": task["title"],
        "description": task.get("description"),
        "status": task.get("status", "pending"),
        "due_date": task.get("due_date"),
        "assignee_user_ids": assignee_ids,
        "assignee_names": [_user_name(users_by_id.get(uid)) or uid for uid in assignee_ids],
        "subtasks": [_format_subtask(subtask, users_by_id) for subtask in task.get("subtasks", [])],
        "comments": task.get("comments", []),
        "created_by_user_id": task["created_by_user_id"],
        "created_by_name": _user_name(users_by_id.get(task.get("created_by_user_id"))),
        "created_at": task["created_at"],
        "updated_at": task["updated_at"],
    }


@router.get("/assignees")
async def list_task_assignees(current_user: dict = Depends(get_current_user)):
    _require_task_user(current_user)
    db = get_db()
    users = await _active_task_users(db)
    return [
        {
            "user_id": user["user_id"],
            "username": user.get("username"),
            "full_name": user.get("full_name"),
            "role": user.get("role"),
        }
        for user in users
    ]


@router.get("/", response_model=List[TaskResponse])
async def list_tasks(
    status: Optional[TaskStatus] = Query(None),
    assigned_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    mine: bool = False,
    current_user: dict = Depends(get_current_user),
):
    _require_task_user(current_user)
    db = get_db()
    query = {}
    if status:
        query["status"] = status.value
    if mine:
        query["assignee_user_ids"] = current_user["user_id"]
    elif assigned_to:
        query["assignee_user_ids"] = assigned_to
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]

    rows = await db.tasks.find(query).sort("updated_at", -1).to_list(500)
    return [await _format_task(db, row) for row in rows]


@router.post("/", response_model=TaskResponse)
async def create_task(data: TaskCreate, current_user: dict = Depends(get_current_user)):
    _require_task_user(current_user)
    db = get_db()
    assignee_user_ids = await _validate_assignees(db, data.assignee_user_ids)
    now = now_ist_str()
    subtasks = []
    notify_ids = set(assignee_user_ids)
    for item in data.subtasks:
        subtask_assignees = await _validate_assignees(db, item.assignee_user_ids)
        notify_ids.update(subtask_assignees)
        subtasks.append({
            "subtask_id": generate_subtask_id(),
            "title": item.title,
            "status": _enum_value(item.status),
            "due_date": item.due_date,
            "assignee_user_ids": subtask_assignees,
            "created_at": now,
            "updated_at": now,
        })

    doc = {
        "task_id": generate_task_id(),
        "title": data.title,
        "description": data.description,
        "status": _enum_value(data.status),
        "due_date": data.due_date,
        "assignee_user_ids": assignee_user_ids,
        "subtasks": subtasks,
        "comments": [],
        "created_by_user_id": current_user["user_id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.tasks.insert_one(doc)
    notify_ids.discard(current_user["user_id"])
    if notify_ids:
        await notify_users(
            db,
            notify_ids,
            "New Task Assigned",
            f"{doc['title']} was assigned to you",
            {"task_id": doc["task_id"], "type": "task_assigned"},
        )
    return await _format_task(db, doc)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, current_user: dict = Depends(get_current_user)):
    _require_task_user(current_user)
    db = get_db()
    task = await db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return await _format_task(db, task)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, data: TaskUpdate, current_user: dict = Depends(get_current_user)):
    _require_task_user(current_user)
    db = get_db()
    task = await db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    payload = data.model_dump(exclude_unset=True)
    if "status" in payload:
        payload["status"] = _enum_value(payload["status"])
    if "assignee_user_ids" in payload:
        payload["assignee_user_ids"] = await _validate_assignees(db, payload["assignee_user_ids"])
    payload["updated_at"] = now_ist_str()

    result = await db.tasks.find_one_and_update(
        {"task_id": task_id},
        {"$set": payload},
        return_document=True,
    )
    return await _format_task(db, result)


@router.post("/{task_id}/subtasks", response_model=TaskResponse)
async def add_subtask(task_id: str, data: SubTaskCreate, current_user: dict = Depends(get_current_user)):
    _require_task_user(current_user)
    db = get_db()
    task = await db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    assignee_ids = await _validate_assignees(db, data.assignee_user_ids)
    now = now_ist_str()
    subtask = {
        "subtask_id": generate_subtask_id(),
        "title": data.title,
        "status": _enum_value(data.status),
        "due_date": data.due_date,
        "assignee_user_ids": assignee_ids,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.tasks.find_one_and_update(
        {"task_id": task_id},
        {"$push": {"subtasks": subtask}, "$set": {"updated_at": now}},
        return_document=True,
    )
    return await _format_task(db, result)


@router.patch("/{task_id}/subtasks/{subtask_id}", response_model=TaskResponse)
async def update_subtask(task_id: str, subtask_id: str, data: SubTaskUpdate, current_user: dict = Depends(get_current_user)):
    _require_task_user(current_user)
    db = get_db()
    task = await db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    payload = data.model_dump(exclude_unset=True)
    subtasks = task.get("subtasks", [])
    updated = False
    for subtask in subtasks:
        if subtask.get("subtask_id") == subtask_id:
            if "title" in payload:
                subtask["title"] = payload["title"]
            if "status" in payload:
                subtask["status"] = _enum_value(payload["status"])
            if "due_date" in payload:
                subtask["due_date"] = payload["due_date"]
            if "assignee_user_ids" in payload:
                subtask["assignee_user_ids"] = await _validate_assignees(db, payload["assignee_user_ids"])
            subtask["updated_at"] = now_ist_str()
            updated = True
            break
    if not updated:
        raise HTTPException(status_code=404, detail="Subtask not found")

    result = await db.tasks.find_one_and_update(
        {"task_id": task_id},
        {"$set": {"subtasks": subtasks, "updated_at": now_ist_str()}},
        return_document=True,
    )
    return await _format_task(db, result)


@router.post("/{task_id}/comments", response_model=TaskResponse)
async def add_task_comment(task_id: str, data: TaskCommentCreate, current_user: dict = Depends(get_current_user)):
    _require_task_user(current_user)
    db = get_db()
    task = await db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    now = now_ist_str()
    comment = {
        "comment_id": generate_task_comment_id(),
        "comment": data.comment,
        "created_by_user_id": current_user["user_id"],
        "created_by_name": current_user.get("full_name") or current_user.get("username"),
        "created_at": now,
    }
    result = await db.tasks.find_one_and_update(
        {"task_id": task_id},
        {"$push": {"comments": comment}, "$set": {"updated_at": now}},
        return_document=True,
    )

    notify_ids = set(task.get("assignee_user_ids", []))
    notify_ids.discard(current_user["user_id"])
    if notify_ids:
        await notify_users(
            db,
            notify_ids,
            "Task Comment Added",
            f"{comment['created_by_name']} commented on {task['title']}",
            {"task_id": task_id, "type": "task_comment"},
        )
    return await _format_task(db, result)
