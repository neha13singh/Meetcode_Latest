from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError
import json
import logging
import asyncio
import time
import uuid
from typing import Dict

from app.core.config import settings
from app.db.session import get_db
from app.services.websocket_manager import manager
from app.services.matchmaking_service import matchmaking_service
from app.models.user import User
from app.api import deps
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Track timeout tasks: user_id -> Task
queue_timeout_tasks: Dict[str, asyncio.Task] = {}

router = APIRouter()

async def handle_queue_timeout(user_id: str, difficulty: str):
    try:
        await asyncio.sleep(60)
        # Timeout reached: remove from queue and notify
        await matchmaking_service.remove_from_queue(user_id, difficulty)
        
        # Cleanup task reference
        if user_id in queue_timeout_tasks:
            del queue_timeout_tasks[user_id]
            
        practice_id = f"practice-{uuid.uuid4()}"
        await manager.send_personal_message(
            {"event": "match:practice", "data": {"difficulty": difficulty, "practiceId": practice_id}},
            user_id
        )
    except asyncio.CancelledError:
        # Task was cancelled (match found or user left), do nothing
        pass

async def get_user_from_token(token: str, db: AsyncSession) -> User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        return None
        
    result = await db.execute(select(User).where(User.username == username))
    return result.scalars().first()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str, # passed as query param ?token=...
    db: AsyncSession = Depends(get_db)
):
    # Verify User
    user = await get_user_from_token(token, db)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = str(user.id)
    await manager.connect(websocket, user_id)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                event = message.get("event")
                payload = message.get("data", {})
                
                # --- EVENT HANDLERS ---
                
                # 1. Matchmaking: Join Queue
                if event == "queue:join":
                    difficulty = payload.get("difficulty", "medium")  # default to medium
                    await matchmaking_service.add_to_queue(user_id, difficulty)

                    # Start timeout task (cancel existing if any)
                    if user_id in queue_timeout_tasks:
                        queue_timeout_tasks[user_id].cancel()
                    
                    queue_timeout_tasks[user_id] = asyncio.create_task(
                        handle_queue_timeout(user_id, difficulty)
                    )
                    
                    # Notify user they joined
                    await manager.send_personal_message(
                        {"event": "queue:status", "data": {"status": "joined", "difficulty": difficulty}},
                        user_id
                    )
                    
                    # Try to match immediately
                    match_result = await matchmaking_service.check_queue(difficulty, db)
                    
                    if match_result:
                        match_id, p1_id, p2_id = match_result
                        
                        # Cancel timeout tasks for both users
                        for pid in [p1_id, p2_id]:
                            if pid in queue_timeout_tasks:
                                queue_timeout_tasks[pid].cancel()
                                del queue_timeout_tasks[pid]
                        
                        start_time = int(time.time() * 1000) + 5000  # Start in 5 seconds

                        
                        # Notify P1
                        await manager.send_personal_message(
                            {"event": "match:found", "data": {"matchId": match_id, "opponentId": p2_id, "startTime": start_time}},
                            p1_id
                        )
                        # Notify P2
                        await manager.send_personal_message(
                            {"event": "match:found", "data": {"matchId": match_id, "opponentId": p1_id, "startTime": start_time}},
                            p2_id
                        )
                        
                        # Add to connection groups
                        await manager.add_user_to_match(match_id, p1_id)
                        await manager.add_user_to_match(match_id, p2_id)

                # 2. Matchmaking: Leave Queue
                elif event == "queue:leave":
                    difficulty = payload.get("difficulty", "medium")
                    
                    # Cancel timeout task
                    if user_id in queue_timeout_tasks:
                        queue_timeout_tasks[user_id].cancel()
                        del queue_timeout_tasks[user_id]

                    await matchmaking_service.remove_from_queue(user_id, difficulty)
                    await manager.send_personal_message(
                        {"event": "queue:status", "data": {"status": "left"}},
                        user_id
                    )

                # 3. Match: Join (User enters the editor page)
                elif event == "match:join":
                    match_id = payload.get("matchId")
                    if match_id:
                        await manager.add_user_to_match(match_id, user_id)
                        # Broadcast presence?
                
                # 4. Match: Code Update (optional, for collaborative feel or anti-cheat)
                # elif event == "code:update": ...

                # 5. Match: Submit Result
                # Done via REST API, but server can push notifications to opponent here
                
                else:
                    logger.warning(f"Unknown event: {event}")

            except json.JSONDecodeError:
                logger.error("Invalid JSON received")
                
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        
        # Cancel timeout task
        if user_id in queue_timeout_tasks:
            queue_timeout_tasks[user_id].cancel()
            del queue_timeout_tasks[user_id]
            
        # Handle cleanup: remove from queues if potentially searching
        # await matchmaking_service.remove_from_queue(user_id, "active_difficulty") # need state tracking for this
