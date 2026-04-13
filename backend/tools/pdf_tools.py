from io import BytesIO
from pypdf import PdfReader


def extract_pdf_text(pdf_bytes: bytes, document_name: str) -> dict:
    reader = PdfReader(BytesIO(pdf_bytes))

    pages = []
    full_text = ""

    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append({
            "page": i + 1,
            "text": text
        })
        full_text += text + "\n\n"

    return {
        "document_name": document_name,
        "pages": pages,
        "full_text": full_text
    }