# Stage 1: Build NextJS application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application (creates standalone output)
RUN npm run build

# Stage 2: Production runtime with vLLM
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS production

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3-pip \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set python3.11 as default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

# Create and activate virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip and install vLLM
RUN pip install --upgrade pip && \
    pip install vllm

# Create app directory
WORKDIR /app

# Copy standalone build from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Create directories for models and data
RUN mkdir -p /models /app/data \
 && curl -LsSf https://hf.co/cli/install.sh | bash \
 && mv /root/.local/bin/hf /usr/local/bin/hf

# Set environment variables
ENV NODE_ENV=production
ENV MODELS_PATH=/models
ENV DATA_PATH=/app/data
ENV VLLM_EXECUTABLE=/opt/venv/bin/vllm
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV AUTH_TRUST_HOST=true

# Expose ports
# 3000: NextJS web interface
# 8000-8100: vLLM instances
EXPOSE 3000
EXPOSE 8000-8100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/auth/session || exit 1

# Start the application using the standalone server
CMD ["node", "server.js"]
