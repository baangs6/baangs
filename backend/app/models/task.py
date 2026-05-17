from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    pending = "pending"
    on_track = "on_track"
    at_risk = "at_risk"
    off_track = "off_track"
    completed = "completed"
    paused = "paused"
    canceled = "canceled"


class SubTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    assignee_user_ids: List[str] = Field(default_factory=list)
    status: TaskStatus = TaskStatus.pending


class SubTaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    assignee_user_ids: Optional[List[str]] = None
    status: Optional[TaskStatus] = None


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.pending
    due_date: Optional[str] = None
    assignee_user_ids: List[str] = Field(default_factory=list)
    subtasks: List[SubTaskCreate] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    due_date: Optional[str] = None
    assignee_user_ids: Optional[List[str]] = None


class TaskCommentCreate(BaseModel):
    comment: str = Field(..., min_length=1, max_length=2000)


class TaskResponse(BaseModel):
    task_id: str
    title: str
    description: Optional[str] = None
    status: str
    due_date: Optional[str] = None
    assignee_user_ids: List[str] = Field(default_factory=list)
    assignee_names: List[str] = Field(default_factory=list)
    subtasks: List[dict] = Field(default_factory=list)
    comments: List[dict] = Field(default_factory=list)
    created_by_user_id: str
    created_by_name: Optional[str] = None
    created_at: str
    updated_at: str
