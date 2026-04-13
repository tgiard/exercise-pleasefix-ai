from fastapi import FastAPI, File, Form, UploadFile
from dotenv import load_dotenv
from typing import Optional
import os
import json
from google import genai
from google.genai import types
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
from models.chat_models import ChatRequest, ChatResponse, Document
from tools.pdf_tools import extract_pdf_text
from prompts.chat_prompts import BASE_SYSTEM_PROMPT
from prompts.chat_prompts import build_agent_prompt, build_final_prompt

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY_PERSONAL")
#GEMINI_API_KEY = os.getenv("GEMINI_API_KEY_PERSONAL_2")
#GEMINI_API_KEY = os.getenv("GEMINI_API_KEY_PERSONAL_3")
#GEMINI_API_KEY = os.getenv("GEMINI_API_KEY_PERSONAL_4")
gemini_client = genai.Client(api_key=GEMINI_API_KEY)
MODEL_GEMINI = os.getenv("MODEL_GEMINI")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://localhost:3000",
        "https://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- HELPERS ----------
def get_function_call(response):
    if not response.candidates:
        return None

    for candidate in response.candidates:
        if candidate.content and candidate.content.parts:
            for part in candidate.content.parts:
                if getattr(part, "function_call", None):
                    return part.function_call
    return None

def execute_tool(function_call, tool_context):
    if function_call.name == "extract_pdf_text":
        pdf_bytes = tool_context.get("pdf_bytes")
        document_name = tool_context.get("document_name")

        if not pdf_bytes or not document_name:
            return {"error": "No PDF available"}

        return extract_pdf_text(pdf_bytes, document_name)

    return {"error": f"Unknown tool: {function_call.name}"}

# ---------- ENDPOINT ----------

@app.post("/chat", response_model=ChatResponse)
async def chat(
    message: str = Form(...),
    conversation_history: Optional[str] = Form(None),
    excel_context: Optional[str] = Form(None),
    documents: Optional[UploadFile] = File(default=None),
):
    conversation_history_data = json.loads(conversation_history) if conversation_history else []
    excel_context_data = json.loads(excel_context) if excel_context else None

    pdf_bytes = None    

    if documents:
        pdf_bytes = await documents.read()
        print("PDF received :", documents.filename, "size :", len(pdf_bytes))

    tool_context = {
        "pdf_bytes": pdf_bytes,
        "document_name": documents.filename if documents else None,
    }
  
    parsed_documents = None

    request = ChatRequest(
        message=message,
        conversation_history=conversation_history_data,
        excel_context=excel_context_data,
        documents=parsed_documents,
    )

    user_payload = {
        "message": request.message,
        "excel_context": request.excel_context.model_dump() if request.excel_context else None,
        "documents": [doc.model_dump() for doc in request.documents] if request.documents else None,
    }

    history_text = ""

    if request.conversation_history:
        for msg in request.conversation_history:
            history_text += f"{msg.role.upper()}: {msg.content}\n"

    
    #PROMPT
    agent_prompt = build_agent_prompt(
        system_prompt=BASE_SYSTEM_PROMPT,
        history_text=history_text,
        message=request.message,
        excel_context=json.dumps(request.excel_context.model_dump() if request.excel_context else None, indent=2),
        document_name=documents.filename if documents else None,
    )

    #TOOLS
    tools = [
        types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="extract_pdf_text",
                    description="Extract the textual content of a PDF document. Use this when you need to read or analyze a PDF.",
                    parameters={
                        "type": "object",
                        "properties": {},
                    },
                )
            ]
        )
    ]

   # LLM CALL
    try:
        max_tool_iterations = 5   
        agent_state = agent_prompt
        tool_iteration_count = 0

        while True:
            print("AGENT LOOP ITERATION:", tool_iteration_count)
            response = gemini_client.models.generate_content(
                model=MODEL_GEMINI,
                contents=agent_state,
                config=types.GenerateContentConfig(
                    tools=tools
                ),
            )

            function_call = get_function_call(response)

            if not function_call:
                break

            tool_result = execute_tool(function_call, tool_context)

            agent_state += f"""

            Tool result:
            {json.dumps(tool_result, indent=2)}
            """

            tool_iteration_count += 1

            if tool_iteration_count >= max_tool_iterations:
                break

        print("FINAL CONTEXT READY")

        final_prompt = build_final_prompt(agent_state, request.message)

        follow_up_response = gemini_client.models.generate_content(
            model=MODEL_GEMINI,
            contents=final_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )

        answer = follow_up_response.text if follow_up_response.text else "No response from model."

    except Exception as e:
        print("GEMINI ERROR:", e)
        answer = json.dumps({
            "answer": f"Gemini error: {str(e)}",
            "actions": []
        })

    try:
        print("FINAL ANSWER RAW:", answer)
        parsed = json.loads(answer)
        print("FINAL ANSWER PARSED:", parsed)
        return parsed
    except json.JSONDecodeError:
        return {
            "answer": answer,
            "actions": []
        }
