"""add_transfer_details_to_student

Revision ID: 8cae22d4c8f9
Revises: 5d4710ddff50
Create Date: 2026-02-18 07:49:33.026712

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8cae22d4c8f9'
down_revision = '5d4710ddff50'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('students', sa.Column('transfer_school', sa.String(length=255), nullable=True, comment='Name of the school the student transferred to'))
    op.add_column('students', sa.Column('transfer_reason', sa.String(length=255), nullable=True, comment='Reason for transfer'))


def downgrade() -> None:
    op.drop_column('students', 'transfer_reason')
    op.drop_column('students', 'transfer_school')