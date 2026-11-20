# CampusConnect – Smart Lost & Found Management System Using AWS

![CampusConnect Banner](https://img.shields.io/badge/CampusConnect-v1.0.0-blue.svg)
![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Tailwind%20CSS-61dafb.svg)
![NodeJS](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933.svg)
![AWS](https://img.shields.io/badge/Cloud-AWS%20Serverless%20Architecture-232f3e.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

> **"Lost Something? Find It. Found Something? Return It."**

---

## 1. Project Overview

### 1.1 Problem Statement
College campuses witness daily instances of students misplacing essential personal belongings—student identification cards, wallets, scientific calculators, laboratory notebooks, textbooks, earphones, chargers, and house keys. 

Currently, students depend on fragmented, informal channels:
- Unorganized WhatsApp groups and Telegram channels
- Casual inquiries with classmates and faculty
- Physically wandering across campus security offices, libraries, and administrative departments

These manual channels suffer from lack of centralization, delayed response times, absence of verification, and privacy risks (such as students sharing personal phone numbers publicly).

### 1.2 Proposed Solution
**CampusConnect** is a centralized, responsive, cloud-architected lost and found platform tailored for higher education institutions. It connects students who lose personal items with individuals or staff members who find them. 

The platform features:
1. **Differentiated Reporting Workflows:** Text-first reporting for lost items without forcing unavailable photographs, alongside strict mandatory photographic proof and dual-location tracking for found items.
2. **Rule-Based Smart Matching:** An intelligent 5-factor scoring engine that pairs lost and found reports and notifies potential owners.
3. **Secure Recovery Workflow:** Multi-stage ownership verification that keeps sensitive pickup coordinates private until an administrator or finder verifies proof of ownership.
4. **Cloud-Ready Serverless Architecture:** Designed with Amazon Cognito, Amazon DynamoDB, Amazon S3, AWS Lambda, Amazon API Gateway, and Amazon SNS, equipped with a 100% cost-free local mock development mode.

---

## 2. Core Features Implemented

### Feature 1: Student Registration & Authentication
- **Secure Authentication Flow:** Secure registration using Name, College Email, Password, and Official College Roll/ID Number.
- **Email Verification Simulation:** Enforces email verification status before granting sensitive permissions.
- **JWT Session Management:** Generates JSON Web Tokens with 24-hour expiration.
- **Role-Based Access Control (RBAC):** Granular separation between standard students and campus administrators. Students can only edit or delete their own reports; administrators have full governance.
- **Local Dev vs. Cloud:** Uses secure bcrypt hashing (salt rounds: 10) in local mode, with AWS Cognito User Pools integration ready for cloud deployment.

### Feature 2: Dual Lost and Found Reporting Workflows
- **Report a Lost Item (Text-First, Image Optional):**
  - Compulsory: Item name, category, detailed textual description, date lost.
  - Optional: Location lost, identifying marks, photograph (students who lost an item often do not have a photo).
- **Report a Found Item (Photo Mandatory & Dual-Location Tracking):**
  - Compulsory: Item name, category, detailed description, date found.
  - **Mandatory Photograph:** Upload enforced before submission; backend rejects found reports lacking image proof.
  - **Dual-Location Tracking:** Enforces both *Location Found* (e.g., "Library 2nd Floor") and *Current Pickup Location* (e.g., "Central Security Office, Desk 3").
- **Privacy Guard:** The reporter's personal phone number, home address, and real-time location are never publicly displayed. Public pickup details are shielded until ownership is approved.

### Feature 3: Smart Search & Item Matching Engine
- **Search & Filtering:** Real-time multi-parameter search by keyword, item category, campus location, and date ranges.
- **5-Factor Rule-Based Matching Algorithm:**
  1. **Category Exact Match (30 Points):** Ensures matching happens within compatible classes.
  2. **Item Name Keyword Overlap (25 Points):** Jaccard token overlap between report titles.
  3. **Description Word Overlap (20 Points):** Text similarity scoring across descriptive attributes.
  4. **Location Proximity (15 Points):** Keyword matching on specific campus zones (e.g., "Library", "Canteen", "Lab").
  5. **Date Proximity (10 Points):** Reports within 7 days receive full points, decaying linearly over 30 days.
- **Confidence Tiers:**
  - `HIGH Confidence` (Score $\ge 70$)
  - `MEDIUM Confidence` (Score $\ge 40$)
  - `LOW Confidence` (Score $\ge 20$)
  - Transparent match rationale displayed to users without false guarantees.

### Feature 4: Claim Verification, Notifications & Recovery
- **Ownership Claim Submission:** A claimant submits specific distinguishing details (e.g., serial numbers, marks, specific contents, scratch locations).
- **Security Isolation:** Pickup instructions are strictly hidden until claim approval.
- **Review Workflow:** Finders or Campus Administrators evaluate claims, accepting or rejecting with audit notes.
- **Status Lifecycle:** `ACTIVE` $\rightarrow$ `CLAIMED` $\rightarrow$ `RECOVERED` (or `CANCELLED`).
- **Notification Center:** Real-time in-app alerts on matches, claim submissions, approvals, and recovery handoffs. AWS SNS adapter ready for email broadcasting.

---

## 3. Technology Stack

| Layer | Technologies | Role / Justification |
|---|---|---|
| **Frontend** | React 19, React Router v7, Tailwind CSS, Lucide / React Icons, Axios, React Hot Toast | Responsive, modern, clean single-page application with accessible UI components. |
| **Backend** | Node.js, Express.js, Express Validator, JWT, Multer, Bcrypt.js | RESTful API server, validation middleware, and business logic execution. |
| **Cloud Database** | Amazon DynamoDB (with in-memory Map mock for local dev) | Low-latency NoSQL database with flexible item schema and GSI querying. |
| **Cloud Auth** | Amazon Cognito (with bcrypt/JWT mock for local dev) | Secure user registration, MFA, and OAuth 2.0 / JWT issuance. |
| **Object Storage** | Amazon S3 (with local disk storage for dev) | Secure image storage using presigned upload URLs (no public write access). |
| **Notifications** | Amazon SNS (with in-app notification engine) | Asynchronous push notifications and campus broadcast alerts. |
| **Hosting** | AWS Amplify Hosting (frontend) & AWS Lambda + API Gateway (backend) | Scalable, pay-as-you-go serverless hosting with zero idle cost. |
| **Monitoring** | Amazon CloudWatch | Execution logs, alarm thresholds, and API traffic metrics. |

---

## 4. AWS Cloud Architecture

```
                       +----------------------------------+
                       |           STUDENT / ADMIN        |
                       |         (Browser / Mobile)       |
                       +-----------------+----------------+
                                         |
                                         | HTTPS (TLS 1.3)
                                         v
                       +----------------------------------+
                       |        AWS Amplify Hosting       |
                       |      (Static Web Assets & CDN)   |
                       +-----------------+----------------+
                                         |
                                         | REST API Calls
                                         v
                       +----------------------------------+
                       |       Amazon API Gateway         |
                       |    (REST Endpoints, CORS, Throttling)
                       +--------+-----------------+-------+
                                |                 |
         Cognito Authorizer JWT |                 | Presigned URL
                                v                 v
        +----------------------------+      +---------------------------+
        |       Amazon Cognito       |      |         Amazon S3         |
        |   (User Pool & Identity)   |      |  (Encrypted Image Store)  |
        +----------------------------+      +---------------------------+
                                |
                                v
        +---------------------------------------------------------------+
        |                   AWS Lambda Functions                        |
        |                (Node.js Execution Runtime)                    |
        +---------------+---------------+---------------+---------------+
                        |               |               |
                        v               v               v
        +-----------------------+ +-----------+ +-----------------------+
        |    Amazon DynamoDB    | | Amazon S3 | |      Amazon SNS       |
        |  (Items, Claims, Users| | (Metadata | |  (Email Notifications)|
        +-----------------------+ +-----------+ +-----------------------+
                        |
                        v
        +-------------------------------+
        |       Amazon CloudWatch       |
        |    (Logs, Metrics, Alarms)    |
        +-------------------------------+
```

---

## 5. Project Folder Structure

```
LostAndFound/
├── .gitignore                      # Git exclusion rules (secrets, node_modules)
├── README.md                       # Comprehensive project guide and reference
├── PROJECT_EXPLANATION.md          # Technical mentor walkthrough & viva prep
│
├── backend/                        # Node.js / Express / AWS Backend
│   ├── .env                        # Local environment configuration
│   ├── .env.example                # Template with placeholder variables
│   ├── package.json                # Backend dependencies and scripts
│   ├── test-backend.js             # Automated 17-point test suite
│   ├── uploads/                    # Local image storage directory
│   │   └── .gitkeep
│   └── src/
│       ├── server.js               # Express application entry point
│       ├── config/
│       │   └── aws.js              # AWS SDK v3 client configuration stubs
│       ├── controllers/
│       │   ├── adminController.js  # Campus administrative controls
│       │   ├── authController.js   # Authentication & session controllers
│       │   ├── claimController.js  # Ownership claim submission & review
│       │   ├── itemController.js   # Lost and found CRUD controllers
│       │   ├── notificationController.js # Notification retrieval & read status
│       │   └── uploadController.js # S3 presigned URL and local file upload
│       ├── middleware/
│       │   ├── auth.js             # JWT authentication & RBAC guards
│       │   └── errorHandler.js     # Centralized error handler & ApiError class
│       ├── models/
│       │   └── mockData.js         # In-memory mock database & sample data
│       ├── routes/
│       │   ├── admin.js            # /api/admin routes
│       │   ├── auth.js             # /api/auth routes
│       │   ├── claims.js           # /api/claims routes
│       │   ├── items.js            # /api/items routes
│       │   ├── notifications.js    # /api/notifications routes
│       │   └── uploads.js          # /api/uploads routes
│       ├── services/
│       │   ├── authService.js      # Password hashing, JWT token generation
│       │   ├── claimService.js     # Claim validation & pickup disclosure
│       │   ├── itemService.js      # Item management & ownership checks
│       │   ├── notificationService.js # Notification creation & auto-match alerts
│       │   ├── searchService.js    # 5-factor rule-based matching engine
│       │   └── uploadService.js    # Multer configuration & image validation
│       └── utils/
│           └── validators.js       # Express-validator input validation rules
│
└── frontend/                       # React 19 Frontend Application
    ├── package.json                # Frontend dependencies
    ├── tailwind.config.js          # Tailwind CSS theme & custom palette
    ├── postcss.config.js           # PostCSS configuration
    ├── public/
    │   ├── index.html              # HTML entry point with Inter font
    │   └── favicon.ico
    └── src/
        ├── App.js                  # Master router with ProtectedRoute guards
        ├── index.js                # React 19 createRoot entry
        ├── index.css               # Tailwind CSS directives
        ├── api/
        │   ├── axios.js            # Axios client with JWT interceptor
        │   ├── adminApi.js         # Admin endpoints integration
        │   ├── claimsApi.js        # Claims endpoints integration
        │   ├── itemsApi.js         # Lost & found items API
        │   ├── notificationsApi.js # Notification retrieval API
        │   └── uploadApi.js        # Image upload API
        ├── components/
        │   ├── common/
        │   │   ├── CategoryBadge.js# Category visual pills
        │   │   ├── EmptyState.js   # Empty data illustrations
        │   │   ├── ItemCard.js     # Lost/found item card display
        │   │   ├── LoadingSpinner.js# Animated loading spinners
        │   │   ├── Modal.js        # Accessible modal dialogue
        │   │   ├── StatsCard.js    # Dashboard numeric summary cards
        │   │   └── StatusBadge.js  # Active/Claimed/Recovered badges
        │   └── layout/
        │       ├── Footer.js       # Global footer
        │       ├── Navbar.js       # Navigation bar with notification badge
        │       ├── ProtectedRoute.js# Route auth & role-based guard
        │       └── Sidebar.js      # Dashboard sidebar navigation
        ├── context/
        │   └── AuthContext.js      # Global authentication state
        └── pages/
            ├── AdminDashboardPage.js # Comprehensive admin control center
            ├── BrowsePage.js       # Search, filter, and item browsing
            ├── DashboardPage.js    # Student overview & recent activity
            ├── ForgotPasswordPage.js # Password recovery request page
            ├── ItemDetailsPage.js  # Detailed report view & claim submission
            ├── LandingPage.js      # Hero section, feature walkthrough & CTA
            ├── LoginPage.js        # Student & admin login form
            ├── NotificationsPage.js# Match and claim alert inbox
            ├── RegisterPage.js     # Student signup with College ID
            ├── ReportFoundPage.js  # Found item form (mandatory image)
            └── ReportLostPage.js   # Lost item form (optional image)
```

---

## 6. Database Design (Amazon DynamoDB)

CampusConnect uses Amazon DynamoDB with a single-table or multi-table pattern. Below is the multi-table schema optimized for serverless query efficiency:

### 6.1 `CampusConnect_Users` Table
| Attribute | Type | Key Type | Description |
|---|---|---|---|
| `userId` | String | **Partition Key (PK)** | UUID v4 or Cognito Sub identifier |
| `email` | String | GSI-1 PK | Student college email |
| `name` | String | Attribute | Full student or admin name |
| `collegeId` | String | Attribute | Official college registration number |
| `role` | String | Attribute | `student` or `admin` |
| `emailVerified` | Boolean | Attribute | Verification state |
| `createdAt` | String | Attribute | ISO 8601 timestamp |

### 6.2 `CampusConnect_Items` Table
| Attribute | Type | Key Type | Description |
|---|---|---|---|
| `reportId` | String | **Partition Key (PK)** | Unique report UUID |
| `reportType` | String | GSI-1 PK | `LOST` or `FOUND` |
| `createdAt` | String | GSI-1 SK | Sorting reports newest first |
| `reporterId` | String | GSI-2 PK | User ID of student reporting |
| `itemName` | String | Attribute | Name of the item |
| `category` | String | GSI-3 PK | Item category for filtering |
| `description` | String | Attribute | Detailed textual description |
| `imageKey` | String | Attribute | S3 Object Key or local path (Mandatory for FOUND) |
| `dateLost` | String | Attribute | Date lost (LOST reports) |
| `dateFound` | String | Attribute | Date found (FOUND reports) |
| `locationLost` | String | Attribute | Location where item was misplaced |
| `locationFound` | String | Attribute | Location where item was discovered |
| `pickupLocation`| String | Attribute | Safe collection desk (Restricted visibility) |
| `status` | String | Attribute | `ACTIVE`, `CLAIMED`, `RECOVERED`, `CANCELLED` |
| `updatedAt` | String | Attribute | Timestamp of last modification |

### 6.3 `CampusConnect_Claims` Table
| Attribute | Type | Key Type | Description |
|---|---|---|---|
| `claimId` | String | **Partition Key (PK)** | Unique claim UUID |
| `reportId` | String | GSI-1 PK | Target found item report ID |
| `claimantId` | String | GSI-2 PK | User ID of student claiming item |
| `ownershipDescription`| String | Attribute | Proof text and distinguishing marks |
| `claimStatus` | String | Attribute | `PENDING`, `APPROVED`, `REJECTED` |
| `reviewedBy` | String | Attribute | Reviewer user ID (Admin or Finder) |
| `reviewNote` | String | Attribute | Feedback or collection instruction |
| `createdAt` | String | Attribute | Claim timestamp |

### 6.4 `CampusConnect_Notifications` Table
| Attribute | Type | Key Type | Description |
|---|---|---|---|
| `notificationId`| String | **Partition Key (PK)**| Unique notification UUID |
| `userId` | String | GSI-1 PK | Recipient student ID |
| `createdAt` | String | GSI-1 SK | Notification timestamp |
| `message` | String | Attribute | Alert message content |
| `notificationType` | String | Attribute | `MATCH_FOUND`, `CLAIM_RECEIVED`, `CLAIM_APPROVED` |
| `relatedItemId` | String | Attribute | Related report identifier |
| `readStatus` | Boolean | Attribute | Has the user read the notification |

---

## 7. REST API Documentation

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Register student with name, email, password, and college ID.
- `POST /api/auth/login` — Authenticate and receive 24h JWT token.
- `GET /api/auth/profile` — (Auth required) Fetch authenticated user details.
- `POST /api/auth/forgot-password` — Request password reset link.
- `POST /api/auth/reset-password` — Set new password using token.

### Item Reports (`/api/items`)
- `POST /api/items/lost` — (Auth required) Report a lost item (image is optional).
- `POST /api/items/found` — (Auth required) Report a found item (**photograph is mandatory**, found and pickup locations required).
- `GET /api/items` — Query items with filters (`search`, `category`, `status`, `reportType`, `page`, `limit`).
- `GET /api/items/:reportId` — Retrieve single report details.
- `PUT /api/items/:reportId` — (Auth required) Update report (owner or admin only).
- `DELETE /api/items/:reportId` — (Auth required) Remove report (owner or admin only).
- `GET /api/items/:reportId/matches` — (Auth required) Execute 5-factor smart matching engine.

### Claims & Recovery (`/api/claims`)
- `POST /api/claims` — (Auth required) Submit ownership claim with proof description.
- `GET /api/claims` — (Auth required) Retrieve user's submitted claims.
- `GET /api/claims/:claimId` — (Auth required) Retrieve single claim details.
- `PUT /api/claims/:claimId/review` — (Auth required: Finder or Admin) Approve or reject claim.
- `GET /api/claims/:claimId/pickup` — (Auth required) Safely access pickup instructions after claim approval.

### Notifications (`/api/notifications`)
- `GET /api/notifications` — (Auth required) Fetch user notifications.
- `GET /api/notifications/unread-count` — (Auth required) Unread notification count.
- `PUT /api/notifications/:notificationId/read` — (Auth required) Mark notification as read.

### Uploads (`/api/uploads`)
- `POST /api/uploads/upload` — (Auth required) Multipart upload for item images (local dev).
- `POST /api/uploads/presigned-url` — (Auth required) Request S3 presigned PUT URL for cloud uploads.

### Administrative Control Center (`/api/admin`)
- `GET /api/admin/stats` — (Admin only) System-wide metrics, counts, and health overview.
- `GET /api/admin/reports` — (Admin only) All campus reports with full metadata.
- `PUT /api/admin/reports/:reportId/status` — (Admin only) Override report status.
- `DELETE /api/admin/reports/:reportId` — (Admin only) Remove inappropriate or fraudulent reports.
- `GET /api/admin/claims` — (Admin only) All campus claims for review and dispute resolution.
- `GET /api/admin/users` — (Admin only) Directory of all registered campus members.

---

## 8. Local Setup Instructions (Zero AWS Cost)

You do **not** need an AWS account or credit card to run, test, and demonstrate CampusConnect. The application includes a pre-configured in-memory mock data store that replicates DynamoDB, Cognito, S3, and SNS.

### Prerequisites
- Node.js (v18 or higher recommended; v26 supported)
- npm (v9 or higher)
- Git

### Step 1: Clone the Repository
```bash
git clone https://github.com/YourUsername/CampusConnect.git
cd CampusConnect
```

### Step 2: Configure Environment Variables
**Backend Configuration:**
The backend `.env` file is already created. For reference, copy `.env.example`:
```bash
cd backend
cp .env.example .env
```
Ensure `USE_LOCAL_MOCK=true` is set in `backend/.env`.

### Step 3: Run the Backend Server
```bash
cd backend
npm install
npm start
```
The backend starts on `http://localhost:5000`. You will see:
```
🚀 CampusConnect Backend Server
   Port: 5000
   Environment: development
   Mock Mode: ON (local data)
   API: http://localhost:5000/api/health
```

### Step 4: Run the Backend Automated Test Suite
In a separate terminal:
```bash
cd backend
node test-backend.js
```
Expected output: **17 PASSED, 0 FAILED**.

### Step 5: Start the React Frontend
In a new terminal window:
```bash
cd frontend
npm install
npm start
```
The browser will automatically open `http://localhost:3000`.

---

## 9. Sample Test Credentials

Use these pre-populated credentials during development and project demonstrations:

| Role | Email | Password | College ID | Use Case |
|---|---|---|---|---|
| **Student (User 1)** | `aarav@college.edu` | `Password@123` | CS2024001 | Has reported lost wallet & calculator |
| **Student (User 2)** | `priya@college.edu` | `Password@123` | EC2024015 | Has reported found wallet & lost bag |
| **Student (User 3)** | `rahul@college.edu` | `Password@123` | ME2024030 | Has reported found earbuds & calculator |
| **Administrator** | `admin@college.edu` | `Admin@123` | ADMIN001 | Full access to Admin Portal (`/admin`) |

---

## 10. AWS Cloud Configuration & Deployment Guide

When you are ready to deploy CampusConnect to Amazon Web Services, follow these instructions. 

> [!CAUTION]
> **AWS Cost Warning:** Only deploy with explicit permission. Follow the cost precaution guidelines below to avoid unexpected cloud charges.

### Step 1: Amazon Cognito Setup
1. Open the **Amazon Cognito Console** $\rightarrow$ Create User Pool.
2. Sign-in options: **Email**.
3. Password policy: Minimum 8 characters with numbers and symbols.
4. Required standard attributes: `name`, `email`.
5. Custom attributes: `collegeId` (String).
6. Create an **App Client** (disable client secret for public browser clients).
7. Note down `User Pool ID` and `App Client ID`.

### Step 2: Amazon S3 Bucket Setup
1. Open the **Amazon S3 Console** $\rightarrow$ Create Bucket: `campusconnect-item-images-[unique-id]`.
2. Block all public access: **Enable** (Bucket remains private).
3. CORS configuration:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": ["https://*.amplifyapp.com", "http://localhost:3000"],
    "ExposeHeaders": ["ETag"]
  }
]
```

### Step 3: Amazon DynamoDB Setup
Create four on-demand billing tables:
1. `CampusConnect_Users` (PK: `userId` [String])
2. `CampusConnect_Items` (PK: `reportId` [String])
3. `CampusConnect_Claims` (PK: `claimId` [String])
4. `CampusConnect_Notifications` (PK: `notificationId` [String])

### Step 4: AWS Lambda & API Gateway Setup
1. Package `backend/src` with `package.json` into a zip archive.
2. Create Lambda function: Runtime **Node.js 20.x**, IAM Role with DynamoDB and S3 access policies.
3. In **Amazon API Gateway**, create an HTTP API or REST API with Proxy integration forwarding to your Lambda function.
4. Enable CORS and configure Cognito Authorizer.

### Step 5: AWS Amplify Hosting (Frontend)
1. Connect your GitHub repository to **AWS Amplify Console**.
2. Select branch `main`.
3. Build settings are auto-detected (`npm run build`, output folder: `build`).
4. Save and deploy.

---

## 11. Critical AWS Cost Precautions & Cleanup Guide

### Cost Precautions
1. **Always use On-Demand Capacity for DynamoDB:** Avoid provisioned capacity which bills hourly whether used or not. On-demand billing is free within 25 RCU/WCU.
2. **Lambda Free Tier:** 1,000,000 free requests per month and 3.2 million seconds of compute time.
3. **S3 Free Tier:** 5 GB standard storage, 20,000 GET requests, 2,000 PUT requests.
4. **Cognito Free Tier:** 50,000 Monthly Active Users (MAUs) are completely free.
5. **Set AWS Budgets Alert:** Go to **AWS Billing Console** $\rightarrow$ **Budgets** $\rightarrow$ Create Budget $\rightarrow$ Maximum Amount: `$1.00`. Configure email alert at 80% threshold.

### Complete Cloud Resource Cleanup (Tear-down)
To avoid lingering cloud costs after project review:
1. **S3:** Empty the `campusconnect-item-images` bucket, then click **Delete Bucket**.
2. **DynamoDB:** Delete all four `CampusConnect_*` tables.
3. **Cognito:** Delete the `CampusConnect-UserPool`.
4. **API Gateway:** Delete the REST/HTTP API.
5. **Lambda:** Delete the backend Lambda function and CloudWatch log groups.
6. **Amplify:** Go to AWS Amplify $\rightarrow$ App settings $\rightarrow$ Delete App.

---

## 12. License
This project is licensed under the MIT License — feel free to use and adapt for academic and educational projects.

