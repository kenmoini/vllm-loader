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
# FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS production
FROM nvcr.io/nvidia/cuda:13.1.0-devel-ubuntu24.04 AS production

ENV CUDA_HOME=/usr/local/cuda
# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 LC_ALL=C.UTF-8 \
    TZ=Etc/UTC \
    # CUDA toolchain paths
    PATH=/usr/local/cuda/bin:${PATH} \
    LD_LIBRARY_PATH=/usr/local/cuda/lib64:${LD_LIBRARY_PATH}

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.12 \
    python3.12-venv \
    python3-pip \
    git curl wget ca-certificates \
    libnuma1 openssh-client \
    nvidia-cuda-toolkit \
    build-essential cmake ninja-build pkg-config \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Quality-of-life: make Python point to python3
RUN echo 'alias python=python3' >> ~/.bashrc \
 && echo 'alias pip=pip3' >> ~/.bashrc

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:/root/.cargo/bin:${PATH}"

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set python3.12 as default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1

# Create and activate virtual environment
RUN python3 -m venv /opt/venv \
    && sed -i 's|# reset old environment variables|unset CUDA_HOME\n\t# reset old environment variables|' /opt/venv/bin/activate \
    && sed -i 's|export VIRTUAL_ENV_PROMPT|export CUDA_HOME=/usr/local/cuda\nexport VIRTUAL_ENV_PROMPT|' /opt/venv/bin/activate \
    && cat /opt/venv/bin/activate
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip and install vLLM
RUN pip install --upgrade pip && \
    pip install vllm torch torchvision && \
    pip cache purge

# Install kvcached
# RUN pip install kvcached --no-build-isolation && \
#     pip cache purge

# Working directory
WORKDIR /workspace

RUN git clone https://github.com/ovg-project/kvcached.git
WORKDIR /workspace/kvcached
# Force refresh
ARG CACHE_BREAKER=none
RUN git pull
WORKDIR /workspace/kvcached/engine_integration/scripts
RUN chmod +x setup.sh
RUN ./setup.sh --engine vllm --method source --version 0.11.0
RUN ./setup.sh --engine sglang --method source --version 0.5.3

# Create app directory
WORKDIR /app

# Copy standalone build from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Create directories for models and data, install Hugging Face CLI
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
ENV ENABLE_KVCACHED=true
ENV KVCACHED_AUTOPATCH=1

# Expose ports
# 3000: NextJS web interface
# 8000-8100: vLLM instances
EXPOSE 3000
EXPOSE 8000-8100
EXPOSE 12346 30000 30001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/auth/session || exit 1

# Start the application using the standalone server
CMD ["node", "server.js"]
