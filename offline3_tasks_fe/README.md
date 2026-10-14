# Task & Project Management Frontend

A modern, responsive, and robust Single Page Application (SPA) built with **React 18**, **TypeScript**, **Vite**, and **Tailwind CSS**. Designed for collaborative project management with strict Role-Based Access Control (RBAC), quota enforcement, real-time security lockout, and an administrative control panel.

---

## ⚡ Tech Stack

- **Framework**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 6](https://vitejs.dev/)
- **Styling**: [Tailwind CSS 3](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Routing**: [React Router v7](https://reactrouter.com/)
- **HTTP Client**: [Axios](https://axios-http.com/)

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: `v18.0.0` or higher (tested on Node v20/v22/v24)
- **npm**: `v9.0.0` or higher
- **Backend API**: Running instance of the FastAPI backend (defaults to `http://localhost:8000`)

### 2. Clone and Install Dependencies
```bash
# Clone the repository
git clone <repo-url>
cd frontend_students

# Install project dependencies
npm install
```

### 3. Environment Configuration
Copy the sample environment file to create your local `.env`:
```bash
cp .env.example .env
```

Verify or adjust the backend URL in `.env`:
```env
VITE_API_URL=http://localhost:8000
```

### 4. Run Development Server
```bash
npm run dev
```
The application will start locally with Hot Module Replacement (HMR) at:
**`http://localhost:5173`**

### 5. Build for Production
```bash
# Type-check and bundle production assets
npm run build

# Preview production build locally
npm run preview
```
Production assets are generated in the `dist/` directory.

---

## 📂 Project Structure

```text
frontend_students/
├── docs/                   # Requirements and architecture specifications
├── public/                 # Static public assets
├── src/
│   ├── components/         # Reusable UI & layout components
│   │   ├── common/         # Modal, QuotaAlert, Form inputs
│   │   ├── guards/         # ProtectedRoute, GuestRoute, AdminRoute
│   │   ├── layout/         # Navbar (RBAC-aware), AppLayout
│   │   └── security/       # BannedModal (lockout overlay)
│   ├── context/            # AuthContext (state, tokens, session rehydration)
│   ├── pages/              # Application views
│   │   ├── admin/          # AdminDashboardPage (users, quotas, settings)
│   │   ├── auth/           # LoginPage, RegisterPage
│   │   ├── projects/       # ProjectsListPage, ProjectDetailPage
│   │   └── tasks/          # TasksListPage
│   ├── services/           # Axios API client, interceptors, and service modules
│   │   └── api.ts
│   ├── types/              # TypeScript interfaces and contracts
│   │   └── index.ts
│   ├── App.tsx             # Root routing configuration
│   ├── index.css           # Tailwind base styles and custom utilities
│   └── main.tsx            # Application entry point
├── .env.example            # Environment variable template
├── .gitignore              # Git ignored files and directories
├── package.json            # Scripts and dependencies
├── tailwind.config.js      # Tailwind design system configuration
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite bundler & dev proxy configuration
```

---

## ✨ Key Features & Architecture

### 1. Authentication & Session Persistence
- **OAuth2 Password Bearer**: `POST /auth/login` uses `application/x-www-form-urlencoded` and supports login via either **username** OR **email**.
- **User Registration**: `POST /auth/register` with client validation, password confirmation, and duplicate credential handling.
- **Session Bootstrap**: Automatic session rehydration on page load via `GET /auth/me` with persistent JWT storage in `localStorage`.
- **RBAC Route Guarding**:
  - `GuestRoute`: Redirects logged-in users away from `/login` and `/register`.
  - `ProtectedRoute`: Requires authentication for `/projects` and `/tasks`.
  - `AdminRoute`: Restricts `/admin` strictly to users with `role: "admin"`.
  - Dynamic Navbar: Administrative links are hidden from non-admin accounts.

### 2. Centralized Interceptors & Security
- **Banned Account Lockout (HTTP 403)**:
  - Intercepts `"your account is temporarily banned"` responses.
  - Automatically wipes authentication tokens and active sessions.
  - Displays a modal security lockout banner (`BannedModal`) and redirects to `/login?banned=true`.
- **Session Expiration (HTTP 401)**:
  - Purges invalid tokens and returns the user to the login view.
- **Quota Limit Handling (HTTP 400)**:
  - Retains all user inputs when project or task creation quotas are reached.
  - Displays the exact backend message in an inline `QuotaAlert` without closing modals.

### 3. Resource & Collaboration Management
- **Project Ownership**: Clearly distinguishes between project owners and collaborators.
- **Collaborator Isolation**: In accordance with specifications, project collaborators only see tasks assigned to them and receive clear UI notices.
- **Task Assignment & Sharing by Username**:
  - Assign tasks directly using a username string.
  - Delegate edit rights (`can_edit: true`) to specific usernames.
  - Assignees can toggle completion status (`PATCH /tasks/:id/status`) with instant optimistic updates.

### 4. Admin Management Dashboard (`/admin`)
- **Backend-Side Paginated User Directory**:
  - Integrated with backend pagination (`GET /admin/users?page=1&limit=10`).
  - Configurable page sizes: **5, 10, 15, 20** (defaults to 10).
  - Responsive page navigation (Previous/Next, direct page buttons, ellipsis).
  - Search filtering by username, email, or user ID.
  - Soft-deleted account visibility toggle (`include_deleted=true`).
- **Account Moderation**:
  - Toggle active/banned status with confirmation dialogs.
  - Soft-delete accounts with self-protection (cannot delete own account) and last-admin protection.
- **Quota Overrides & Counters**:
  - Inspect user resource usage (`projects_count`, `tasks_count`).
  - Set custom quota overrides for individual users or reset to global defaults.
- **Global Settings**:
  - View and update global default quotas for projects and tasks across all users.

---

## 🛠️ Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Vite local development server on port 5173 with HMR. |
| `npm run build` | Runs TypeScript compilation (`tsc -b`) and bundles production assets. |
| `npm run preview` | Spins up a local web server to preview the production build (`dist/`). |

---

## 🌐 Production API Configuration

To change the backend API endpoint for production:
1. Create a `.env.production` file (or set environment variables in your deployment pipeline like Vercel, Netlify, or Docker):
   ```env
   VITE_API_URL=https://api.yourdomain.com
   ```
2. Run `npm run build`. Vite will automatically inline the production base URL into the bundled output.
3. Ensure your production FastAPI backend allows the frontend domain in its `CORSMiddleware` configuration.

---

## 📄 License
This project is private and intended for educational and institutional evaluation.
