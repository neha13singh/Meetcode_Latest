from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api import deps
from app.db.session import get_db
from app.models.match import Match
from app.models.question import Question
from app.schemas.match import Match as MatchSchema, MatchCreate

router = APIRouter()

@router.post("/", response_model=MatchSchema)
async def create_match(
    *,
    db: AsyncSession = Depends(get_db),
    match_in: MatchCreate,
    current_user = Depends(deps.get_current_user),
) -> Any:
    """
    Create a new match (practice).
    """
    from app.models.match import Match, MatchParticipant
    from datetime import datetime
    import uuid
    
    # Defaults
    max_time = 3600 # 1 hour for practice
    
    # If question_id provided, verify
    if match_in.question_id:
        result = await db.execute(select(Question).where(Question.id == match_in.question_id))
        if not result.scalars().first():
             raise HTTPException(status_code=404, detail="Question not found")
             
    # Create Match
    match = Match(
        question_id=match_in.question_id,
        mode=match_in.mode,
        difficulty=match_in.difficulty,
        max_time=max_time,
        status="active",
        started_at=datetime.utcnow()
    )
    db.add(match)
    await db.flush() # get ID
    
    # Add User as Participant
    participant = MatchParticipant(
        match_id=match.id,
        user_id=current_user.id
    )
    db.add(participant)
    await db.commit()
    await db.refresh(match)
    
    # Eager load for response
    query = (
        select(Match)
        .where(Match.id == match.id)
        .options(
            selectinload(Match.question).selectinload(Question.test_cases),
            selectinload(Match.question).selectinload(Question.templates),
            selectinload(Match.participants)
        )
    )
    result = await db.execute(query)
    return result.scalars().first()

@router.get("/{match_id}", response_model=MatchSchema)
async def read_match(
    match_id: str,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(deps.get_current_user),
) -> Any:
    """
    Get match by ID with question details.
    """
    try:
        query = (
            select(Match)
            .where(Match.id == match_id)
            .options(
                selectinload(Match.question).selectinload(Question.test_cases),
                selectinload(Match.question).selectinload(Question.templates),
                selectinload(Match.participants)
            )
        )
        result = await db.execute(query)
        match = result.scalars().first()
        
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")
            
        return match
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
