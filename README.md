# vLLM Loader

> Not affliated with the vLLM Engine

## Core Features
- Model Management: Download GGUF models from URLs or S3 buckets with progress tracking
- Process Management: Spawn/stop multiple concurrent vLLM instances with configurable parameters
- Chat Interface: OpenAI-compatible chat with streaming responses
- Real-time Updates: SSE streaming for process logs and status

## Project Structure

vllm-loader/
├── docker/
│   ├── Dockerfile          # Multi-stage: Node + CUDA + vLLM
│   └── docker-compose.yml
├── src/
│   ├── app/
│   │   ├── page.tsx        # Dashboard
│   │   ├── models/         # Model management page
│   │   ├── processes/      # Process management page
│   │   ├── chat/           # Chat interface
│   │   ├── login/          # Authentication page
│   │   └── api/            # REST & SSE endpoints
│   ├── lib/
│   │   ├── process-manager.ts   # vLLM process control
│   │   ├── download-manager.ts  # URL/S3 downloads
│   │   ├── model-registry.ts    # Model tracking
│   │   ├── vllm-config.ts       # CLI arg builder
│   │   └── port-manager.ts      # Port allocation
│   ├── hooks/              # React hooks (SSE, chat)
│   ├── components/         # UI components
│   └── types/              # TypeScript definitions
└── .env.example            # Environment template

## To Run Locally (Development)

```bash
# Copy env template
cp .env.example .env.local
# Edit .env.local with your credentials

# Install and run
npm install
npm run dev
```

## To Run with Docker

```bash
cd docker
docker-compose up --build
```

Access the app at http://localhost:3000 with the credentials set in environment variables.