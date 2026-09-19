from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


async def require_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    """Verify with Supabase Auth; never trust an unverified decoded JWT."""
    if credentials is None:
        raise HTTPException(401, "Sign in first", headers={"WWW-Authenticate": "Bearer"})
    if not settings.supabase_configured:
        raise HTTPException(503, "Supabase is not configured")
    client: httpx.AsyncClient = request.app.state.http
    try:
        response = await client.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {credentials.credentials}",
            },
        )
    except httpx.RequestError as exc:
        raise HTTPException(503, "Authentication service unavailable") from exc
    if response.status_code in (401, 403):
        raise HTTPException(401, "Invalid or expired session")
    if response.status_code != 200:
        raise HTTPException(503, "Authentication service unavailable")
    user_id = response.json().get("id")
    if not user_id:
        raise HTTPException(401, "Invalid session")
    return user_id
