"""WebSocket endpoint for real-time price and alert streaming."""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.app.logging_config import get_logger

router = APIRouter()
logger = get_logger("websocket")


class ConnectionManager:
    """Manages WebSocket connections and broadcast channels."""

    def __init__(self):
        # symbol -> set of websockets
        self.subscriptions: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, symbols: list[str]):
        await websocket.accept()
        async with self._lock:
            for symbol in symbols:
                key = symbol.upper()
                if key not in self.subscriptions:
                    self.subscriptions[key] = set()
                self.subscriptions[key].add(websocket)
        logger.info("ws_connected", symbols=symbols)

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            for symbol, connections in self.subscriptions.items():
                connections.discard(websocket)
        logger.info("ws_disconnected")

    async def broadcast(self, symbol: str, data: dict):
        key = symbol.upper()
        connections = self.subscriptions.get(key, set())
        dead = []
        for ws in connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            connections.discard(ws)


class AlertManager:
    """Manages WebSocket connections for alert/signal broadcasts."""

    def __init__(self):
        self.connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.connections.add(websocket)
        logger.info("alert_ws_connected")

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.connections.discard(websocket)

    async def broadcast_signal(self, signal: dict):
        """Broadcast a new signal to all connected alert clients."""
        dead = []
        for ws in self.connections:
            try:
                await ws.send_json({"type": "signal", "data": signal})
            except Exception:
                dead.append(ws)
        async with self._lock:
            for ws in dead:
                self.connections.discard(ws)


manager = ConnectionManager()
alert_manager = AlertManager()


@router.websocket("/ws/prices")
async def ws_prices(websocket: WebSocket, symbols: str = "BTCUSD"):
    """
    Connect to receive real-time price updates.
    Query param: ?symbols=BTCUSD,EURUSD,XAUUSD
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    await manager.connect(websocket, symbol_list)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("action") == "subscribe":
                    new_symbols = msg.get("symbols", [])
                    await manager.connect(websocket, new_symbols)
                elif msg.get("action") == "unsubscribe":
                    for s in msg.get("symbols", []):
                        manager.subscriptions.get(s.upper(), set()).discard(websocket)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        await manager.disconnect(websocket)


@router.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    """Connect to receive real-time signal notifications."""
    await alert_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except WebSocketDisconnect:
        await alert_manager.disconnect(websocket)
