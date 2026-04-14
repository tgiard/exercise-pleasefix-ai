from io import BytesIO
from pypdf import PdfReader
from pdf2image import convert_from_bytes
import shutil
import os
import warnings


def extract_pdf_text(pdf_bytes: bytes, document_name: str) -> dict:
    # Some real-world PDFs have minor xref/object pointer inconsistencies.
    # Non-strict mode makes parsing more robust for user uploads.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        reader = PdfReader(BytesIO(pdf_bytes), strict=False)

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

def get_pdf_page_image(pdf_bytes: bytes, page_number: int) -> bytes:
    poppler_executable = shutil.which("pdftocairo")
    
    poppler_path = None
    if poppler_executable:
        poppler_path = os.path.dirname(poppler_executable)
    else:
        poppler_path = "/opt/homebrew/bin"

    try:
        images = convert_from_bytes(
            pdf_bytes,
            first_page=page_number,
            last_page=page_number,
            fmt="jpeg",
            dpi=150,
            poppler_path=poppler_path # On passe le dossier trouvé
        )
        
        if not images:
            return None
            
        img_byte_arr = BytesIO()
        images[0].save(img_byte_arr, format='JPEG')
        return img_byte_arr.getvalue()

    except Exception as e:
        print(f"Error converting image: {e}")
        return None