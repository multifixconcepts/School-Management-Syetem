from typing import Any, Dict, List, Optional, Union
from sqlalchemy.orm import Session

from src.db.crud.base import CRUDBase
from src.db.models.auth import UserRole, Permission
from src.schemas.auth.user_role import UserRoleCreate, UserRoleUpdate


class CRUDUserRole(CRUDBase[UserRole, UserRoleCreate, UserRoleUpdate]):
    """CRUD operations for UserRole model."""
    
    def get_by_name(self, db: Session, name: str) -> Optional[UserRole]:
        """Get a user role by name."""
        return db.query(UserRole).filter(UserRole.name == name).first()
    
    def add_permissions_to_role(self, db: Session, role_id: Any, permission_ids: List[Any]) -> UserRole:
        """Add permissions to a role."""
        role = self.get(db, role_id)
        if not role:
            return None
            
        # Add permissions to role
        for permission_id in permission_ids:
            # Get the permission object
            permission = db.query(Permission).filter(Permission.id == permission_id).first()
            if permission and permission not in role.permissions:
                # Add the permission to the role's permissions collection
                role.permissions.append(permission)
            
        db.add(role)
        db.commit()
        db.refresh(role)
        return role

    def set_permissions_to_role(self, db: Session, role_id: Any, permission_ids: List[Any]) -> UserRole:
        """Replace all permissions for a role with the provided ones."""
        role = self.get(db, role_id)
        if not role:
            return None
            
        # Get the permission objects
        permissions = db.query(Permission).filter(Permission.id.in_(permission_ids)).all()
        
        # Replace the collection
        role.permissions = permissions
        
        db.add(role)
        db.commit()
        db.refresh(role)
        return role


user_role = CRUDUserRole(UserRole)

