from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.core.config import settings
from src.db.crud import permission as permission_crud
from src.db.crud import user_role as user_role_crud
from src.schemas.auth import PermissionCreate, UserRoleCreate

# Create database connection
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

# Define permissions
financial_permissions = [
    {"name": "view_financial_data", "description": "Permission to view financial data"},
    {"name": "manage_financial_data", "description": "Permission to manage financial data"},
    {"name": "approve_financial_transactions", "description": "Permission to approve financial transactions"},
    {"name": "generate_financial_reports", "description": "Permission to generate financial reports"}
]

academic_permissions = [
    {"name": "view_academic_data", "description": "Permission to view academic data"},
    {"name": "manage_academic_data", "description": "Permission to manage academic data"},
    {"name": "generate_academic_reports", "description": "Permission to generate academic reports"},
    {"name": "view_student_records", "description": "Permission to view student records"},
    {"name": "manage_student_records", "description": "Permission to manage student records"}
]

admin_permissions = [
    {"name": "manage_users", "description": "Permission to manage users"},
    {"name": "view_tenant_data", "description": "Permission to view tenant data"},
    {"name": "manage_tenant_settings", "description": "Permission to manage tenant settings"},
    {"name": "manage_permissions", "description": "Permission to manage tenant permissions"},
    {"name": "manage_roles", "description": "Permission to manage tenant roles"}
]

# Define role templates
role_templates = {
    "financial-admin": {
        "description": "Administrator with financial management privileges",
        "permissions": financial_permissions
    },
    "academic-admin": {
        "description": "Administrator with academic reporting privileges",
        "permissions": academic_permissions
    },
    "tenant-admin": {
        "description": "Administrator with full tenant access except financial controls",
        "permissions": admin_permissions + academic_permissions  # Excludes financial permissions
    },
    "admin": {
        "description": "Tenant administrator with full access except financial controls",
        "permissions": admin_permissions + academic_permissions
    }
}

try:
    # Get the super-admin role to add all permissions to it
    super_admin_role = user_role_crud.get_by_name(db, name="super-admin")
    if not super_admin_role:
        print("Super-admin role not found")
        exit(1)
    
    # Create all permissions and store their IDs
    all_permissions = financial_permissions + academic_permissions + admin_permissions
    permission_ids = {}
    
    for perm_data in all_permissions:
        perm = permission_crud.get_by_name(db, name=perm_data["name"])
        if not perm:
            perm = permission_crud.create(
                db,
                obj_in=PermissionCreate(
                    name=perm_data["name"],
                    description=perm_data["description"]
                )
            )
        permission_ids[perm.name] = perm.id
    
    # Add ALL permissions to super-admin role (not just financial)
    all_perm_ids = [permission_ids[p["name"]] for p in all_permissions]
    user_role_crud.add_permissions_to_role(db, super_admin_role.id, all_perm_ids)
    
    # Create role templates
    for role_name, role_data in role_templates.items():
        role = user_role_crud.get_by_name(db, name=role_name)
        if not role:
            role = user_role_crud.create(
                db,
                obj_in=UserRoleCreate(
                    name=role_name,
                    description=role_data["description"]
                )
            )
        
        # Add permissions to role
        role_perm_ids = [permission_ids[p["name"]] for p in role_data["permissions"]]
        user_role_crud.add_permissions_to_role(db, role.id, role_perm_ids)
        
    print("Successfully created RBAC roles and permissions")
    
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()