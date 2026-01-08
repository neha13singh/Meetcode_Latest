import json
import time
import logging
from typing import Optional, List, Tuple
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.config import settings
from app.models.match import Match, MatchParticipant
from app.models.question import Question, TestCase
from app.models.user import User # explicit import
import uuid

logger = logging.getLogger(__name__)

class MatchmakingService:
    def __init__(self):
        self.redis = redis.from_url(f"redis://{settings.REDIS_HOST}:6379", decode_responses=True)
        self.QUEUE_PREFIX = "matchmaking:queue:"

    async def add_to_queue(self, user_id: str, difficulty: str) -> None:
        """Add user to matchmaking queue with timestamp score"""
        queue_key = f"{self.QUEUE_PREFIX}{difficulty}"
        await self.redis.zadd(queue_key, {user_id: time.time()})
        logger.info(f"User {user_id} added to queue {difficulty}")

    async def remove_from_queue(self, user_id: str, difficulty: str) -> None:
        """Remove user from queue"""
        queue_key = f"{self.QUEUE_PREFIX}{difficulty}"
        await self.redis.zrem(queue_key, user_id)
        logger.info(f"User {user_id} removed from queue {difficulty}")

    async def check_queue(self, difficulty: str, db: AsyncSession) -> Optional[Tuple[str, str, str]]:
        """
        Check if queue has enough players for a match.
        Returns: (match_id, user1_id, user2_id) if match created, else None
        """
        queue_key = f"{self.QUEUE_PREFIX}{difficulty}"
        
        # Check active count
        count = await self.redis.zcard(queue_key)
        
        if count >= 2:
            # Pop 2 oldest users
            # ZPOPMIN returns list of (member, score) tuples
            users_with_scores = await self.redis.zpopmin(queue_key, 2)
            if len(users_with_scores) < 2:
                # Race condition, put back if only 1
                if users_with_scores:
                    await self.redis.zadd(queue_key, {users_with_scores[0][0]: users_with_scores[0][1]})
                return None
                
            user1_id = users_with_scores[0][0]
            user2_id = users_with_scores[1][0]
            
            # Create Match in DB
            match_id = await self._create_match(db, user1_id, user2_id, difficulty)
            
            return match_id, user1_id, user2_id
            
        return None

    async def _create_match(self, db: AsyncSession, user1_id: str, user2_id: str, difficulty: str) -> str:
        """Create match record in database"""
        
        # 1. Select a random question of given difficulty
        # Use func.random() for PostgreSQL
        query = select(Question).where(Question.difficulty == difficulty).order_by(func.random()).limit(1)
        result = await db.execute(query)
        question = result.scalars().first()
        
        if not question:
            # Fallback if no specific difficulty found, get any question
            logger.warning(f"No questions found for difficulty {difficulty}, picking random")
            result = await db.execute(select(Question).order_by(func.random()).limit(1))
            question = result.scalars().first()
            if not question:
                raise Exception("No questions available in database")
        
        # 2. Create Match
        # Competitive match time = 2 * average solve time (or fixed 20 mins if missing)
        max_time = (question.avg_solve_time * 2) if question.avg_solve_time else 1200
        
        match = Match(
            question_id=question.id,
            mode="competitive",
            difficulty=difficulty,
            max_time=max_time,
            status="active", # Should start as 'active' or 'waiting'? Let's say active immediately for now
            started_at=func.now()
        )
        db.add(match)
        await db.flush() # get ID
        
        # 3. Add Participants
        p1 = MatchParticipant(match_id=match.id, user_id=uuid.UUID(user1_id))
        p2 = MatchParticipant(match_id=match.id, user_id=uuid.UUID(user2_id))
        
        db.add(p1)
        db.add(p2)
        
        await db.commit()
        await db.refresh(match)
        
        return str(match.id)

matchmaking_service = MatchmakingService()
