"""Add simulator tables: simulated_positions, daily_journal, learning_state

Revision ID: a1b2c3d4e5f6
Revises: fbfec7b09376
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a1b2c3d4e5f6"
down_revision = "fbfec7b09376"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- simulated_positions --
    op.create_table(
        "simulated_positions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("symbol", sa.String(30), nullable=False),
        sa.Column("timeframe", sa.String(10), nullable=False),
        sa.Column(
            "direction",
            sa.Enum("long", "short", name="positiondirection"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("open", "win", "loss", "expired", "cancelled", name="positionstatus"),
            default="open",
        ),
        sa.Column("entry_price", sa.Float(), nullable=False),
        sa.Column("stop_loss", sa.Float(), nullable=False),
        sa.Column("take_profit", sa.Float(), nullable=False),
        sa.Column("exit_price", sa.Float()),
        sa.Column("risk_reward_ratio", sa.Float(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("composite_score", sa.Float(), nullable=False),
        sa.Column("ml_confidence", sa.Float()),
        sa.Column("regime", sa.String(50)),
        sa.Column("signal_reasons", postgresql.JSONB(), default={}),
        sa.Column("indicator_snapshot", postgresql.JSONB(), default={}),
        sa.Column("pnl", sa.Float()),
        sa.Column("pnl_pct", sa.Float()),
        sa.Column("max_favorable", sa.Float()),
        sa.Column("max_adverse", sa.Float()),
        sa.Column("loss_category", sa.String(50)),
        sa.Column("loss_analysis", postgresql.JSONB()),
        sa.Column("mtf_confluence", sa.Boolean(), default=False),
        sa.Column("learning_version", sa.Integer(), default=1),
        sa.Column(
            "opened_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_simpos_symbol", "simulated_positions", ["symbol"])
    op.create_index("ix_simpos_status", "simulated_positions", ["status"])
    op.create_index("ix_simpos_opened", "simulated_positions", ["opened_at"])

    # -- daily_journal --
    op.create_table(
        "daily_journal",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False, unique=True),
        sa.Column("total_trades", sa.Integer(), default=0),
        sa.Column("wins", sa.Integer(), default=0),
        sa.Column("losses", sa.Integer(), default=0),
        sa.Column("expired", sa.Integer(), default=0),
        sa.Column("win_rate", sa.Float(), default=0.0),
        sa.Column("total_pnl", sa.Float(), default=0.0),
        sa.Column("best_trade_pnl", sa.Float(), default=0.0),
        sa.Column("worst_trade_pnl", sa.Float(), default=0.0),
        sa.Column("avg_confidence", sa.Float(), default=0.0),
        sa.Column("avg_rr", sa.Float(), default=0.0),
        sa.Column("symbols_traded", postgresql.JSONB(), default=[]),
        sa.Column("regime_breakdown", postgresql.JSONB(), default={}),
        sa.Column("learning_version", sa.Integer(), default=1),
        sa.Column("notes", sa.Text()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_daily_journal_date", "daily_journal", ["date"], unique=True)

    # -- learning_state --
    op.create_table(
        "learning_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False, unique=True),
        sa.Column("min_confidence", sa.Float(), default=0.65),
        sa.Column("min_composite_score", sa.Float(), default=65.0),
        sa.Column("min_confluence", sa.Integer(), default=6),
        sa.Column("indicator_weights", postgresql.JSONB()),
        sa.Column("feature_importance", postgresql.JSONB(), default={}),
        sa.Column("skip_regimes", postgresql.JSONB(), default=[]),
        sa.Column("rolling_win_rate_50", sa.Float(), default=0.0),
        sa.Column("rolling_win_rate_200", sa.Float(), default=0.0),
        sa.Column("total_trades", sa.Integer(), default=0),
        sa.Column("total_wins", sa.Integer(), default=0),
        sa.Column("total_losses", sa.Integer(), default=0),
        sa.Column("adjustments_log", postgresql.JSONB(), default=[]),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_learning_version", "learning_state", ["version"], unique=True)
    op.create_index("ix_learning_active", "learning_state", ["is_active"])


def downgrade() -> None:
    op.drop_table("learning_state")
    op.drop_table("daily_journal")
    op.drop_table("simulated_positions")
    op.execute("DROP TYPE IF EXISTS positiondirection")
    op.execute("DROP TYPE IF EXISTS positionstatus")
