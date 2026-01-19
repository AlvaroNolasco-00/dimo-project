from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from ..services.wompi import WompiService

router = APIRouter(
    prefix="/payments",
    tags=["payments"],
    responses={404: {"description": "Not found"}},
)

wompi_service = WompiService()

class ChargeRequest(BaseModel):
    amount_in_cents: int
    currency: str = "USD"
    token: Optional[str] = None
    payment_source_id: Optional[str] = None
    email: str
    reference: str
    phone: Optional[str] = None

class CreateSourceResponse(BaseModel):
    data: dict

class CreateSourceRequest(BaseModel):
    token: str
    email: str
    acceptance_token: str

@router.post("/charge")
async def create_charge(request: ChargeRequest):
    """
    Creates a charge using Wompi (One-time or Recurring).
    """
    response = wompi_service.create_transaction(
        amount_in_cents=request.amount_in_cents,
        currency=request.currency,
        # Pass logic to service
        source_id=request.token,
        payment_source_id=request.payment_source_id,
        email=request.email,
        reference=request.reference,
        phone=request.phone
    )
    
    if "error" in response:
         raise HTTPException(status_code=400, detail=response["error"])
    
    return response

@router.post("/source")
async def create_payment_source(request: CreateSourceRequest):
    """
    Creates a permanent payment source from a token.
    """
    response = wompi_service.create_payment_source(
        token=request.token,
        customer_email=request.email,
        acceptance_token=request.acceptance_token
    )
    
    if "error" in response:
         raise HTTPException(status_code=400, detail=response["error"])
         
    return response

@router.get("/transaction/{transaction_id}")
async def check_transaction(transaction_id: str):
    return wompi_service.get_transaction(transaction_id)
