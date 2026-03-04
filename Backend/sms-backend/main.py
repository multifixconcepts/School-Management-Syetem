from fastapi import FastAPI # trigger reload 4
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.utils import get_openapi 

from src.api.v1.api import api_router
from src.core.config import settings
from src.core.logging import setup_logging
from src.core.middleware.audit_middleware import AuditLoggingMiddleware
from src.core.middleware.tenant import tenant_middleware  # Add this import
from src.core.middleware.idle_activity import IdleActivityMiddleware

setup_logging()

from src.core.redis import cache

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Connect to Redis on startup
    await cache.connect()
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.PROJECT_DESCRIPTION,
    version=settings.PROJECT_VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",      
    redoc_url="/redocs",   
    lifespan=lifespan,
    debug=settings.DEBUG,
    redirect_slashes=False,      
)

@app.exception_handler(Exception)
async def debug_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    import traceback
    
    # Extract root cause from ExceptionGroup (Python 3.11+)
    # This is common in async applications using anyio/starlette
    actual_exc = exc
    type_name = type(exc).__name__
    
    if type_name == "ExceptionGroup" or type_name == "BaseExceptionGroup":
        if hasattr(exc, "exceptions") and exc.exceptions:
            actual_exc = exc.exceptions[0]
            type_name = type(actual_exc).__name__

    print(f"ERROR: {type_name}: {repr(actual_exc)}")
    # Log the full traceback for debugging
    traceback.print_exc()
    
    return JSONResponse(
        status_code=500,
        content={
            "detail": str(actual_exc), 
            "type": type_name,
            "message": "An unexpected server error occurred."
        }
    )

from src.core.exceptions.business import BusinessLogicError

@app.exception_handler(BusinessLogicError)
async def business_logic_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)}
    )

# Add tenant middleware BEFORE other middlewares
app.middleware("http")(tenant_middleware)

# Set up CORS middleware
if settings.BACKEND_CORS_ORIGINS:
    print(f"CORS Origins: {settings.BACKEND_CORS_ORIGINS}")
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*", "X-Tenant-ID"],
    )

print("📢 API prefix:", settings.API_V1_STR)
# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)
for route in app.routes:
    print(f"🛣️ {route.path}")

# Static files and OpenAPI customization

# @app.get("/api/v1/super-admin/dashboard/recent-tenants")
# async def get_recent_tenants(limit: int = 5):
#     return [{"id": "1", "name": "Tenant 1", "domain": "example.com", "isActive": True, "createdAt": "2023-01-01", "updatedAt": "2023-01-01", "userCount": 10}]

# @app.get("/api/v1/super-admin/dashboard/tenant-stats")
# async def get_tenant_stats():
#     return {"total": 10, "active": 8, "inactive": 2, "newThisMonth": 1, "growthRate": 0.1}

# @app.get("/api/v1/super-admin/dashboard/user-stats")
# async def get_user_stats():
#     return {"total": 100, "active": 80, "inactive": 20, "avgPerTenant": 10, "recentLogins": 5}

# @app.get("/api/v1/super-admin/dashboard/system-metrics")
# async def get_system_metrics():
#     return {"cpuUsage": 0.5, "memoryUsage": 0.6, "diskUsage": 0.7, "activeConnections": 10, "alerts": [], "tenantGrowth": []}


# Mount static files directory (create if doesn't exist for cloud deployment)
import os
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Add this function to customize the OpenAPI schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title=settings.PROJECT_NAME,
        version=settings.PROJECT_VERSION,
        description=settings.PROJECT_DESCRIPTION,
        routes=app.routes,
    )
    
    # Add global X-Tenant-ID parameter
    openapi_schema["components"]["parameters"] = {
        "X-Tenant-ID": {
            "name": "X-Tenant-ID",
            "in": "header",
            "required": True,
            "schema": {"title": "X-Tenant-ID", "type": "string", "format": "uuid"},
            "description": "Tenant ID (required for all endpoints)",
        }
    }
    
    # Robustly add the parameter only to operation objects
    for path_item in openapi_schema["paths"].values():
        for method in ("get", "put", "post", "delete", "options", "head", "patch"):
            op = path_item.get(method)
            if not isinstance(op, dict):
                continue
            op.setdefault("parameters", [])
            # Avoid duplicates
            if not any(
                isinstance(p, dict) and p.get("$ref") == "#/components/parameters/X-Tenant-ID"
                for p in op["parameters"]
            ):
                op["parameters"].append({"$ref": "#/components/parameters/X-Tenant-ID"})

    app.openapi_schema = openapi_schema
    return app.openapi_schema

# Override the default OpenAPI schema
app.openapi = custom_openapi

@app.get("/test-cors")
async def test_cors():
    return {"message": "CORS is working!"}

# Add this after creating the FastAPI app
app.add_middleware(IdleActivityMiddleware)
app.add_middleware(AuditLoggingMiddleware)
