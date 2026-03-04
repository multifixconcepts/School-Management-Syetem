"""
add missing gradetypes to enum

Revision ID: 12345678abcd
Revises: ff43b3f14110
Create Date: 2026-02-18 23:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '12345678abcd'
down_revision = '7a35f7b40ebf'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL doesn't support ALTER TYPE ... ADD VALUE in a transaction block 
    # unless it's the only command, but Alembic runs in a transaction.
    # We use op.execute with individual committing or just raw SQL.
    
    # Check if we are on PostgreSQL
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        with op.get_context().autocommit_block():
            for value in ['ATTENDANCE', 'PROJECT', 'PARTICIPATION', 'OTHER']:
                # We need to check if value exists to avoid 'already exists' error
                op.execute(sa.text(f"ALTER TYPE gradetype ADD VALUE IF NOT EXISTS '{value}'"))


def downgrade() -> None:
    # Downgrading enums in PostgreSQL is complex (requires dropping/recreating the type)
    # Usually we don't remove values from enums in migrations unless absolutely necessary.
    pass
