FROM python:3.13-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VERSION=1.8.5 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_CREATE=false

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3 - --version $POETRY_VERSION
ENV PATH="$POETRY_HOME/bin:$PATH"

# Set working directory
WORKDIR /app

# Copy poetry files
COPY Backend/sms-backend/pyproject.toml ./

# Remove lock file and let poetry resolve dependencies
RUN if [ -f poetry.lock ]; then rm poetry.lock; fi

# Install dependencies including openpyxl
RUN poetry lock && poetry add openpyxl && poetry install --no-interaction --no-ansi --no-root

# Copy application code
COPY Backend/sms-backend /app/
COPY . /app/

# Expose port
EXPOSE 8000

# Run the application
CMD ["sh", "-c", "cd /app && poetry run alembic upgrade head && poetry run uvicorn main:app --host 0.0.0.0 --port 8000"]
