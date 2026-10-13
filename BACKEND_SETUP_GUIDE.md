# Backend Setup & Execution Guide 🛠️

This document outlines the startup requirements, environment configurations, AWS dependencies, IAM permissions, API endpoints, and step-by-step execution guide for the **Interactive Tech Tutor Backend API** (`apps/api`).

---

## 1. Required Environment Variables

The backend relies on environment variables defined in `apps/api/.env` (modeled after [`apps/api/.env.example`](file:///Users/yatingogia/Interactive-tech%20tutor%20/interactive-tech-tutor/apps/api/.env.example)).

| Variable Name | Required | Default Value | Purpose / Description |
|---|---|---|---|
| `AWS_ACCESS_KEY_ID` | **Yes** | *None* | AWS IAM Access Key ID used to authenticate AWS SDK clients (DynamoDB, S3, Bedrock). |
| `AWS_SECRET_ACCESS_KEY` | **Yes** | *None* | AWS IAM Secret Access Key paired with `AWS_ACCESS_KEY_ID`. |
| `AWS_REGION` | No | `us-east-1` | Primary AWS region for AWS S3 and AWS DynamoDB clients. |
| `AWS_BEDROCK_REGION` | No | `us-west-2` | AWS region specifically for the AWS Bedrock Runtime client. |
| `AWS_S3_BUCKET` | No | `interactive-tech-tutor-cache` | Name of the S3 bucket used for caching generated simulation JSON payloads. |
| `DYNAMODB_TABLE_PREFIX` | No | `itt` | Prefix used when initializing and querying DynamoDB tables (`-users`, `-sessions`, `-simulation-history`). |
| `PORT` | No | `4000` | Local HTTP port on which the Express server listens. |
| `JWT_SECRET` | No | `dev-secret-change-me` | Secret key used for signing and verifying JWT user session tokens. |
| `FRONTEND_ORIGINS` | No | `""` | Comma-separated list of additional frontend origins allowed by CORS. |
| `ALLOWED_ORIGINS` | No | `""` | Additional domain whitelist patterns for CORS validation. |
| `CORS_ORIGIN` | No | `""` | Single origin override for CORS validation. |
| `CACHE_VERSION` | No | `3` | Cache version string used in S3 object key paths (`simulations/v{CACHE_VERSION}/{slug}.json`). |
| `GEMINI_API_KEY` | No | `""` | Optional Google Gemini API key for fallback AI operations. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Gemini model name for fallback AI queries. |
| `GEMINI_BASE_URL` | No | `https://generativelanguage.googleapis.com/v1beta` | Base URL for Google Gemini API requests. |

---

## 2. AWS Services Used

The backend integrates three core AWS cloud services via AWS SDK v3:

1. **AWS Bedrock Runtime (`@aws-sdk/client-bedrock-runtime`)**:
   - Executes foundation model inference using **Nova Pro** (`us.amazon.nova-pro-v1:0`).
   - Generates structured 8–12 step technical simulations (canvas instructions, animation elements, math expressions) and handles AI tutor topic chat queries.
2. **AWS DynamoDB (`@aws-sdk/client-dynamodb` & `@aws-sdk/lib-dynamodb`)**:
   - Primary NoSQL database for persisting user registrations, active session tokens, and simulation interaction histories.
3. **AWS S3 (`@aws-sdk/client-s3`)**:
   - Object store for caching full simulation payloads to accelerate repeat topic requests and reduce Bedrock invocation costs.

---

## 3. AWS Resources Required

Before starting the server, the following AWS resources must exist or be accessible:

* **AWS Bedrock Model Access**:
  - Model ID: `us.amazon.nova-pro-v1:0`
  - Access must be explicitly granted/enabled in your AWS Account in the specified Bedrock region (e.g., `us-west-2`).
* **AWS S3 Bucket**:
  - The bucket named in `AWS_S3_BUCKET` (e.g., `interactive-tech-tutor-cache`) must pre-exist in the specified `AWS_REGION`.
* **AWS DynamoDB Tables** (*Auto-provisioned on startup if IAM permits*):
  - `${DYNAMODB_TABLE_PREFIX}-users` (Partition Key: `userId` `[String]`)
  - `${DYNAMODB_TABLE_PREFIX}-sessions` (Partition Key: `sessionToken` `[String]`)
  - `${DYNAMODB_TABLE_PREFIX}-simulation-history` (Partition Key: `userId` `[String]`, Sort Key: `timestamp` `[String]`)

---

## 4. Minimum IAM Permissions

The IAM credentials (`AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY`) require an attached IAM policy with the following minimum action privileges:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvokePermissions",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*:*:foundation-model/us.amazon.nova-pro-v1:0"
    },
    {
      "Sid": "DynamoDBTablePermissions",
      "Effect": "Allow",
      "Action": [
        "dynamodb:DescribeTable",
        "dynamodb:CreateTable",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/itt-*"
    },
    {
      "Sid": "S3CacheBucketPermissions",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::interactive-tech-tutor-cache",
        "arn:aws:s3:::interactive-tech-tutor-cache/*"
      ]
    }
  ]
}
```

---

## 5. Backend Endpoints (On Successful Startup)

When the server starts successfully on `http://localhost:4000`, the following HTTP endpoints respond:

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/health` | No | Health check returning `{ "ok": true, "service": "interactive-tech-tutor-api" }`. |
| `POST` | `/api/auth/register` | No | Registers a new user account in DynamoDB and returns a JWT token. |
| `POST` | `/api/auth/login` | No | Validates credentials against DynamoDB user table and returns a JWT token. |
| `GET` | `/api/auth/me` | Yes (`Bearer <token>`) | Retrieves profile for current authenticated session. |
| `GET` | `/api/topics` | Yes | Retrieves default list of technical topics. |
| `GET` | `/api/topics/:topicId/problem-sets` | Yes | Retrieves problem sets and quizzes for a given topic. |
| `POST` | `/api/simulations/generate` | Yes | Requests AI simulation step generation (queries S3 cache or Bedrock). |
| `GET` | `/api/user/progress` | Yes | Retrieves user progress records across technical topics. |
| `PUT` | `/api/user/progress` | Yes | Updates progress score and status for a topic. |
| `GET` | `/api/user/history` | Yes | Retrieves user simulation interaction history. |
| `POST` | `/api/ai/chat` | Yes | Interactive AI tutor context-aware chat assistant. |
| `POST` | `/api/ai/feedback` | Yes | Submits interactive user feedback (drag/scroll/voice) for evaluation. |
| `POST` | `/api/ai/visual` | Yes | Uploads visual media metadata for AI mapping. |

---

## 6. Step-by-Step Guide for Running the Backend Locally

### Step 1: Ensure Node.js & npm are installed
Verify Node.js (v18+) is available on your machine:
```bash
node -v
npm -v
```

### Step 2: Install Workspace Dependencies
From the repository root, install dependencies:
```bash
npm install
```

### Step 3: Configure Environment File
Create the `.env` configuration file in `apps/api`:
```bash
cp apps/api/.env.example apps/api/.env
```
Edit `apps/api/.env` and insert your active AWS credentials:
```env
PORT=4000
AWS_REGION=us-east-1
AWS_BEDROCK_REGION=us-west-2
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AWS_S3_BUCKET=your-preexisting-s3-bucket-name
DYNAMODB_TABLE_PREFIX=itt
JWT_SECRET=your-secure-jwt-secret
```

### Step 4: Start the Backend Development Server
Run the backend dev server from the repository root:
```bash
npm run dev:api
```
*(Or navigate to `apps/api` and run `npm run dev`)*

### Step 5: Verify Startup Success
Test the health check endpoint:
```bash
curl http://localhost:4000/health
```
Expected response:
```json
{"ok":true,"service":"interactive-tech-tutor-api"}
```

---

## 7. External Dependencies & Local Execution Blockers

### Why Local Offline Execution Fails Without AWS Credentials

The backend codebase **does not include local mock providers** for DynamoDB, S3, or Bedrock. On startup ([`apps/api/src/index.ts:4327-4338`](file:///Users/yatingogia/Interactive-tech%20tutor%20/interactive-tech-tutor/apps/api/src/index.ts#L4327-L4338)), the server executes mandatory setup sequences before binding to the network port:

1. **DynamoDB Startup Inspection (`initializeDynamoDBTables()`)**:
   - The application immediately validates `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
   - It performs remote AWS API calls (`DescribeTableCommand`, `CreateTableCommand`) against DynamoDB endpoints.
   - If credentials are missing or invalid (`UnrecognizedClientException`), startup throws an unhandled error and terminates the Node.js process with exit code 1.
2. **S3 Startup Cache Inspection (`initializeCacheState()`)**:
   - The application immediately attempts to list and delete existing simulation cache keys in the remote S3 bucket via `ListObjectsV2Command`.
3. **AWS Bedrock Runtime Dependency**:
   - Simulation generation and chat features require live access to AWS Bedrock Nova Pro (`us.amazon.nova-pro-v1:0`).

To run the backend locally, valid cloud AWS credentials with DynamoDB, S3, and Bedrock permissions **must** be provided in `apps/api/.env`.
