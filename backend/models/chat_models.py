from pydantic import BaseModel
from typing import List, Optional, Any, Dict

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
    # On utilise Optional (ou | None en Python 3.10+) pour dire que ce n'est pas requis
    range: Optional[str] = None 
    values: Optional[List[List[Any]]] = None
    format: Optional[Dict[str, Any]] = None
    sheet: Optional[str] = None
    chart_type: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    actions: List[Action] = []