from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from backend.services.wompi import WompiService

router = APIRouter(
    prefix="/payments",
    tags=["payments"],
    responses={404: {"description": "Not found"}},
)

wompi = WompiService()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class CardData(BaseModel):
    numeroTarjeta: str
    cvv: str
    mesVencimiento: int
    anioVencimiento: int


class Transaction3DSRequest(BaseModel):
    monto: float
    nombre: str
    apellido: str
    email: EmailStr
    telefono: str
    ciudad: str
    direccion: str
    idPais: str          # ISO 3166-1 alpha-2, e.g. "SV"
    idRegion: str        # ISO 3166-2, e.g. "SV-SS"
    codigoPostal: str
    tarjeta: CardData
    # Optional: if provided, the post-payment redirect will point to /catalogo/{token}
    category_token: Optional[str] = None
    webhook_url: Optional[str] = None
    notificar_cliente: bool = False
    datos_adicionales: Optional[dict] = None


class Transaction3DSResponse(BaseModel):
    idTransaccion: str
    esReal: bool
    urlCompletarPago3Ds: str
    monto: float


class QRTransactionRequest(BaseModel):
    monto: float
    datos_adicionales: Optional[dict] = None


class FinalizeQRRequest(BaseModel):
    body: dict  # forwarded as-is to Wompi (schema may vary)


class TokenizeCardRequest(BaseModel):
    numeroTarjeta: str
    cvv: str
    mesVencimiento: int
    anioVencimiento: int


# ---------------------------------------------------------------------------
# 3DS Card Payment
# ---------------------------------------------------------------------------

@router.post("/3ds", response_model=Transaction3DSResponse)
async def create_3ds_transaction(request: Transaction3DSRequest):
    """
    Initiates a 3DS card purchase.
    Returns urlCompletarPago3Ds — the frontend must redirect the user there to finish payment.
    After payment, Wompi redirects back to /catalogo/{category_token} (if provided).
    """
    url_redirect = (
        wompi.catalog_redirect_url(request.category_token)
        if request.category_token
        else wompi.redirect_base_url or "/"
    )

    result = wompi.create_3ds_transaction(
        monto=request.monto,
        nombre=request.nombre,
        apellido=request.apellido,
        email=request.email,
        telefono=request.telefono,
        ciudad=request.ciudad,
        direccion=request.direccion,
        id_pais=request.idPais,
        id_region=request.idRegion,
        codigo_postal=request.codigoPostal,
        numero_tarjeta=request.tarjeta.numeroTarjeta,
        cvv=request.tarjeta.cvv,
        mes_vencimiento=request.tarjeta.mesVencimiento,
        anio_vencimiento=request.tarjeta.anioVencimiento,
        url_redirect=url_redirect,
        webhook_url=request.webhook_url,
        notificar_cliente=request.notificar_cliente,
        datos_adicionales=request.datos_adicionales,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


# ---------------------------------------------------------------------------
# QR Payment
# ---------------------------------------------------------------------------

@router.post("/qr")
async def create_qr_transaction(request: QRTransactionRequest):
    """
    Creates a QR code payment transaction.
    The response contains the QR data/URL for the customer to scan.
    """
    result = wompi.create_qr_transaction(
        monto=request.monto,
        datos_adicionales=request.datos_adicionales,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.put("/qr/{transaction_id}")
async def finalize_qr_transaction(transaction_id: str, request: FinalizeQRRequest):
    """
    Finalizes a QR payment after the customer has completed the scan/payment.
    """
    result = wompi.finalize_qr_transaction(transaction_id, request.body)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


# ---------------------------------------------------------------------------
# Card Tokenization
# ---------------------------------------------------------------------------

@router.post("/tokens")
async def tokenize_card(request: TokenizeCardRequest):
    """
    Tokenizes a card for future use. Returns a token ID.
    """
    result = wompi.tokenize_card(
        numero_tarjeta=request.numeroTarjeta,
        cvv=request.cvv,
        mes_vencimiento=request.mesVencimiento,
        anio_vencimiento=request.anioVencimiento,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.get("/tokens")
async def list_tokens(page: int = 1, per_page: int = 20):
    """Lists all tokenized cards linked to the Wompi account."""
    result = wompi.list_tokens(page=page, per_page=per_page)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.delete("/tokens/{token_id}")
async def delete_token(token_id: str):
    """Removes a tokenized card."""
    result = wompi.delete_token(token_id)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result
