from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.api import deps
from app.models.user import User
from app.schemas.user import UserCreate, User as UserSchema
from app.services.auth_service import AuthService
from app.db.session import get_db

router = APIRouter()

@router.post("/register", response_model=UserSchema)
async def register_user(
    *,
    db: AsyncSession = Depends(get_db),
    user_in: UserCreate
) -> Any:
    """
    Create new user.
    """
    # Check if user exists
    result = await db.execute(
        select(User).where(
            or_(User.email == user_in.email, User.username == user_in.username)
        )
    )
    existing_user = result.scalars().first()
    
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="The user with this username or email already exists in the system.",
        )
        
    user = User(
        username=user_in.username,
        email=user_in.email,
        password_hash=AuthService.get_password_hash(user_in.password),
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return user

@router.get("/me", response_model=UserSchema)
async def read_user_me(
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get current user.
    """
    return current_user

@router.get("/{username}", response_model=UserSchema)
async def read_user_by_username(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get a specific user by username.
    """
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    return user

@router.get("/me/matches", response_model=Any)
async def read_user_matches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = 0,
    limit: int = 10,
) -> Any:
    """
    Get current user's match history.
    """
    from app.models.match import MatchParticipant, Match
    from sqlalchemy.orm import selectinload
    
    # Query match participants for this user, ordered by join time descending
    query = (
        select(MatchParticipant)
        .where(MatchParticipant.user_id == current_user.id)
        .order_by(MatchParticipant.joined_at.desc())
        .offset(skip)
        .limit(limit)
        .options(
            selectinload(MatchParticipant.match).selectinload(Match.question),
            selectinload(MatchParticipant.match).selectinload(Match.participants).selectinload(MatchParticipant.user)
        )
    )
    
    result = await db.execute(query)
    participants = result.scalars().all()
    
    # Transform to friendly format
    history = []
    for p in participants:
        match = p.match
        question = match.question
        
        # Find opponent
        opponent = None
        for mp in match.participants:
            if mp.user_id != current_user.id:
                opponent = mp.user
                break
                
        history.append({
            "id": str(match.id),
            "questionTitle": question.title if question else "Unknown",
            "result": p.result or "incomplete",
            "date": p.joined_at,
            "opponent": opponent.username if opponent else "Bot/Solo",
            "duration": p.execution_time # or diff between start/complete
        })
        
    return history
