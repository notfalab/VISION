#!/bin/bash
# VISION — Initialize database tables
docker compose -f docker-compose.prod.yml exec api python -c "
from backend.app.database import Base, engine
from backend.app.models import *
import asyncio
async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('All tables created successfully')
asyncio.run(init())
"
