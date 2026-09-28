import os
import re
import json
import psycopg2
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="API Tesorería", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else genai.Client()

def get_db_connection():
    if not DATABASE_URL:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurada")
    # Pasa la URL directamente para permitir parametros de conexión como sslmode
    return psycopg2.connect(DATABASE_URL)

@app.get("/")
def home():
    return {"status": "ok", "mensaje": "API de Tesorería activa y lista"}

@app.get("/transacciones")
def obtener_transacciones():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, fecha, monto, tipo, medio_pago, numero_comprobante, descripcion
            FROM transacciones 
            ORDER BY fecha DESC;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        resultado = []
        for r in rows:
            resultado.append({
                "id": r[0],
                "fecha": r[1].isoformat() if r[1] else None,
                "monto": float(r[2]),
                "tipo": r[3],
                "medio_pago": r[4],
                "comprobante": r[5],
                "descripcion": r[6]
            })
        return resultado
    except Exception as e:
        print(f"Error BD: {e}")
        raise HTTPException(status_code=500, detail=f"Error en BD: {str(e)}")

@app.post("/escanear-sinpe")
async def escanear_sinpe(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        
        prompt = """
        Analiza esta captura de pantalla de un comprobante de pago (SINPE Móvil / Transferencia).
        Extrae la información relevante y responde ÚNICAMENTE con un JSON estricto con las siguientes llaves:
        - monto: (número entero o decimal positivo, sin símbolos de moneda ni comas)
        - numero_comprobante: (texto con el número de referencia, comprobante o transacción)
        - emisor_o_nota: (nombre de la persona que envía el dinero o detalle del pago)

        Si no encuentras algún dato, asigna null a esa llave.
        NO agregues etiquetas markdown ni texto explicativo. Responde exclusivamente con el JSON.
        """
        
        image_part = types.Part.from_bytes(
            data=contents,
            mime_type=file.content_type or "image/jpeg"
        )
        
        response = client.models.generate_content(
            model='gemini-3.6-flash',
            contents=[image_part, prompt]
        )
        
        raw_text = re.sub(r'```json\s*|\s*```', '', response.text).strip()
        datos = json.loads(raw_text)
        
        return {"status": "exito", "datos": datos}
    except Exception as e:
        print(f"Error Gemini: {e}")
        raise HTTPException(status_code=500, detail=f"Error en Gemini OCR: {str(e)}")

@app.post("/registrar")
def registrar_pago(
    monto: float = Form(...),
    tipo: str = Form(...),
    medio_pago: str = Form(...),
    numero_comprobante: str = Form(None),
    descripcion: str = Form(None)
):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO transacciones (monto, tipo, medio_pago, numero_comprobante, descripcion)
            VALUES (%s, %s, %s, %s, %s) 
            RETURNING id;
        """, (monto, tipo, medio_pago, numero_comprobante, descripcion))
        
        transaccion_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        
        return {"status": "exito", "id": transaccion_id}
    except Exception as e:
        print(f"Error al registrar: {e}")
        raise HTTPException(status_code=500, detail=f"Error en registro: {str(e)}")
