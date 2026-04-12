from __future__ import annotations

import os
import httpx
import time
from typing import Optional
import logging
import requests

logger = logging.getLogger(__name__)


class WompiService:
    def __init__(self):
        self.client_id = os.getenv("WOMPI_CLIENT_ID")
        self.client_secret = os.getenv("WOMPI_CLIENT_SECRET")
        self.token_url = os.getenv("WOMPI_TOKEN_URL", "https://id.wompi.sv/connect/token")
        self.audience = os.getenv("WOMPI_AUDIENCE", "wompi_api")
        self.api_url = os.getenv("WOMPI_API_URL", "https://api.wompi.sv")
        self.redirect_base_url = os.getenv("WOMPI_REDIRECT_BASE_URL", "")  # e.g. https://yourfrontend.com

        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0

    # -------------------------------------------------------------------------
    # Auth
    # -------------------------------------------------------------------------

    def _get_access_token(self) -> str:
        """Returns a valid OAuth2 access token, refreshing it if expired."""
        if self._access_token and time.time() < self._token_expires_at - 30:
            return self._access_token

        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "audience": self.audience,
        }
        try:
            resp = requests.post(
                self.token_url,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            self._access_token = data["access_token"]
            self._token_expires_at = time.time() + data.get("expires_in", 3600)
            return self._access_token
        except Exception as e:
            logger.error(f"Wompi OAuth2 token request failed: {e}")
            raise

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._get_access_token()}",
            "Content-Type": "application/json",
        }

    # -------------------------------------------------------------------------
    # 3DS Card Transaction
    # -------------------------------------------------------------------------

    def create_3ds_transaction(
        self,
        monto: float,
        nombre: str,
        apellido: str,
        email: str,
        telefono: str,
        ciudad: str,
        direccion: str,
        id_pais: str,
        id_region: str,
        codigo_postal: str,
        numero_tarjeta: str,
        cvv: str,
        mes_vencimiento: int,
        anio_vencimiento: int,
        url_redirect: str,
        webhook_url: Optional[str] = None,
        notificar_cliente: bool = False,
        datos_adicionales: Optional[dict] = None,
    ) -> dict:
        """
        Creates a 3DS card purchase transaction.
        Returns { idTransaccion, esReal, urlCompletarPago3Ds, monto }.
        The caller must redirect the user to urlCompletarPago3Ds to complete payment.
        """
        payload = {
            "monto": monto,
            "nombre": nombre,
            "apellido": apellido,
            "email": email,
            "telefono": telefono,
            "ciudad": ciudad,
            "direccion": direccion,
            "idPais": id_pais,
            "idRegion": id_region,
            "codigoPostal": codigo_postal,
            "urlRedirect": url_redirect,
            "tarjetaCreditoDebido": {
                "numeroTarjeta": numero_tarjeta,
                "cvv": cvv,
                "mesVencimiento": mes_vencimiento,
                "anioVencimiento": anio_vencimiento,
            },
        }
        if webhook_url or notificar_cliente:
            payload["configuracion"] = {
                "urlWebhook": webhook_url or "",
                "notificarTransaccionCliente": notificar_cliente,
            }
        if datos_adicionales:
            payload["datosAdicionales"] = datos_adicionales

        try:
            resp = requests.post(
                f"{self.api_url}/TransaccionCompra/3DS",
                json=payload,
                headers=self._headers(),
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as e:
            logger.error(f"Wompi 3DS transaction error: {e.response.text}")
            return {"error": e.response.json() if e.response else str(e)}
        except Exception as e:
            logger.error(f"Wompi 3DS transaction error: {e}")
            return {"error": str(e)}

    # -------------------------------------------------------------------------
    # QR Payment Transaction
    # -------------------------------------------------------------------------

    def create_qr_transaction(self, monto: float, datos_adicionales: Optional[dict] = None) -> dict:
        """
        Creates a QR code payment transaction.
        Returns a QR code/URL that the customer scans to pay.
        """
        payload: dict = {"monto": monto}
        if datos_adicionales:
            payload["datosAdicionales"] = datos_adicionales

        try:
            resp = requests.post(
                f"{self.api_url}/TransaccionCompra/PagoQr",
                json=payload,
                headers=self._headers(),
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as e:
            logger.error(f"Wompi QR transaction error: {e.response.text}")
            return {"error": e.response.json() if e.response else str(e)}
        except Exception as e:
            logger.error(f"Wompi QR transaction error: {e}")
            return {"error": str(e)}

    def finalize_qr_transaction(self, transaction_id: str, body: dict) -> dict:
        """
        Finalizes a QR payment after the customer has scanned and paid.
        """
        try:
            resp = requests.put(
                f"{self.api_url}/TransaccionCompra/PagoQr/{transaction_id}",
                json=body,
                headers=self._headers(),
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as e:
            logger.error(f"Wompi QR finalize error: {e.response.text}")
            return {"error": e.response.json() if e.response else str(e)}
        except Exception as e:
            logger.error(f"Wompi QR finalize error: {e}")
            return {"error": str(e)}

    # -------------------------------------------------------------------------
    # Card Tokenization
    # -------------------------------------------------------------------------

    def tokenize_card(
        self,
        numero_tarjeta: str,
        cvv: str,
        mes_vencimiento: int,
        anio_vencimiento: int,
    ) -> dict:
        """Tokenizes a card for future recurring charges."""
        payload = {
            "numeroTarjeta": numero_tarjeta,
            "cvv": cvv,
            "mesVencimiento": mes_vencimiento,
            "anioVencimiento": anio_vencimiento,
        }
        try:
            resp = requests.post(
                f"{self.api_url}/Tokenizacion",
                json=payload,
                headers=self._headers(),
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as e:
            logger.error(f"Wompi tokenize card error: {e.response.text}")
            return {"error": e.response.json() if e.response else str(e)}
        except Exception as e:
            logger.error(f"Wompi tokenize card error: {e}")
            return {"error": str(e)}

    def list_tokens(self, page: int = 1, per_page: int = 20) -> dict:
        """Lists all tokenized cards for the account."""
        try:
            resp = requests.get(
                f"{self.api_url}/Tokenizacion",
                params={"PaginaActual": page, "CantidadPorPagina": per_page},
                headers=self._headers(),
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as e:
            logger.error(f"Wompi list tokens error: {e.response.text}")
            return {"error": e.response.json() if e.response else str(e)}
        except Exception as e:
            logger.error(f"Wompi list tokens error: {e}")
            return {"error": str(e)}

    def delete_token(self, token_id: str) -> dict:
        """Removes a tokenized card."""
        try:
            resp = requests.delete(
                f"{self.api_url}/Tokenizacion/{token_id}",
                headers=self._headers(),
                timeout=15,
            )
            resp.raise_for_status()
            return {"deleted": True}
        except requests.HTTPError as e:
            logger.error(f"Wompi delete token error: {e.response.text}")
            return {"error": e.response.json() if e.response else str(e)}
        except Exception as e:
            logger.error(f"Wompi delete token error: {e}")
            return {"error": str(e)}

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def catalog_redirect_url(self, category_token: str) -> str:
        """Builds the post-payment redirect URL pointing to the public catalog."""
        return f"{self.redirect_base_url}/catalogo/{category_token}"
