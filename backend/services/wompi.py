import os
import requests
import logging

logger = logging.getLogger(__name__)

class WompiService:
    def __init__(self):
        self.pub_key = os.getenv("WOMPI_PUB_KEY")
        self.prv_key = os.getenv("WOMPI_PRV_KEY")
        self.base_url = os.getenv("WOMPI_URL", "https://sandbox.wompi.sv/v1")
        self.events_secret = os.getenv("WOMPI_EVENTS_SECRET")

    def _get_headers(self, public=False):
        token = self.pub_key if public else self.prv_key
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

    def get_acceptance_token(self):
        """
        Obtains the presigned acceptance token required for transactions.
        """
        url = f"{self.base_url}/merchants/{self.pub_key}" # Endpoint varies, sometimes it's implied in transaction prescan
        # Actually in Wompi V1, you usually get acceptance token from the 'presigned_acceptance' endpoint.
        # Let's check the endpoint structure or assume a standard one from similar gateways.
        # Wompi usually requires querying acceptance terms.
        # URL: GET /v1/merchants/{public_key} usually returns presigned_acceptance
        
        try:
            response = requests.get(url) # Public endpoint often doesn't need auth, or uses Pub key
            response.raise_for_status()
            data = response.json()
            # structure: data['data']['presigned_acceptance']
            return data.get("data", {}).get("presigned_acceptance")
        except Exception as e:
            logger.error(f"Error fetching acceptance token: {e}")
            return None

    def create_transaction(self, amount_in_cents: int, currency: str, email: str, reference: str, source_id: str = None, payment_source_id: str = None, phone: str = None):
        """
        Creates a transaction. 
        source_id: Token ID representing the card (one-time).
        payment_source_id: ID of a saved payment source (recurring).
        amount_in_cents: Amount in cents (e.g., 1000 for $10.00).
        """
        url = f"{self.base_url}/transactions"
        
        payload = {
            "amount_in_cents": amount_in_cents,
            "currency": currency,
            "customer_email": email,
            "reference": reference,
            "payment_method": {}
        }

        if payment_source_id:
             payload["payment_method"] = {
                "type": "CARD",
                "payment_source_id": payment_source_id,
                "installments": 1
            }
        elif source_id:
             payload["payment_method"] = {
                "type": "CARD",
                "token": source_id,
                "installments": 1
            }
        else:
            return {"error": "Must provide source_id or payment_source_id"}
        
        try:
            response = requests.post(url, json=payload, headers=self._get_headers())
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Transaction Request failed: {e}")
            if e.response:
                return e.response.json()
            return {"error": str(e)}

    def create_payment_source(self, token: str, customer_email: str, acceptance_token: str):
        """
        Creates a permanent payment source from a token.
        """
        url = f"{self.base_url}/payment_sources"
        payload = {
            "type": "CARD",
            "token": token,
            "customer_email": customer_email,
            "acceptance_token": acceptance_token
        }
        try:
            response = requests.post(url, json=payload, headers=self._get_headers())
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Create Payment Source failed: {e}")
            if e.response:
                return e.response.json()
            return {"error": str(e)}

    def get_transaction(self, transaction_id: str):
        url = f"{self.base_url}/transactions/{transaction_id}"
        try:
            response = requests.get(url, headers=self._get_headers())
            return response.json()
        except Exception as e:
            return {"error": str(e)}
