from pydantic import BaseModel
from typing import List, Optional, Any

# ---------- INPUT ----------

class Document(BaseModel):
    name: str
    text: str

class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ExcelContext(BaseModel):
    sheet_name: str
    used_range: List[List[Any]]

class ChatRequest(BaseModel):
    message: str
    conversation_history: Optional[List[Message]] = []
    excel_context: Optional[ExcelContext] = None
    documents: Optional[List[Document]] = None

# ---------- OUTPUT ----------

class Action(BaseModel):
    type: str
    sheet: str
    range: str
    values: Optional[List[List[Any]]] = None

class ChatResponse(BaseModel):
    answer: str
    actions: List[Action] = []