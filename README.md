# Veraawell

A modern, secure authentication platform built with the MERN stack and deployed on Vercel (frontend) and Render (backend).

---

## 🚀 Tech Stack

- **Frontend:** React (Vite), TypeScript, Tailwind CSS
- **Backend:** Node.js, Express.js
- **Database:** MongoDB Atlas (cloud)
- **Authentication:** JWT (HttpOnly cookies), bcrypt password hashing
- **OAuth:** (UI ready for Google OAuth)
- **Email:** (Ready for SendGrid integration for password reset)
- **Deployment:**
  - **Frontend:** Vercel (with SPA routing via `vercel.json`)
  - **Backend:** Render.com

---

## 🏗️ Architecture & Features

### 1. **Frontend (React + Vite)**
- Responsive, modern UI with dark mode.
- Authentication pages: Login, Signup, Forgot Password (UI), Google Auth (UI).
- Uses React Router for client-side routing.
- All navigation and protected routes handled client-side.
- Uses `fetch` with `credentials: 'include'` for secure cookie-based auth.
- No sensitive data stored in localStorage/sessionStorage.
- SPA routing enabled via `client/vercel.json` for Vercel deployment.

### 2. **Backend (Node.js + Express)**
- REST API for authentication and user management.
- Passwords are hashed with bcrypt before storing in MongoDB.
- JWTs are issued as HttpOnly cookies for secure, stateless sessions.
- Protected routes verify JWT from cookies and check user existence in DB.
- Logout endpoint clears the auth cookie.
- CORS configured for secure cross-origin requests from frontend.
- Ready for SendGrid integration for password reset emails.

### 3. **Database (MongoDB Atlas)**
- Stores user data: first name, last name, email (as username), hashed password.
- Email is unique and required for all users.

### 4. **OAuth & Password Reset (Planned/Partial)**
- UI for Google OAuth and Forgot Password is implemented.
- Backend ready for integration with Google OAuth and SendGrid for password reset.

---

## 🔒 Authentication Flow

1. **Signup:**
   - User provides first name, last name, email, password.
   - Backend hashes password, stores user, issues JWT as HttpOnly cookie.
2. **Login:**
   - User logs in with email and password.
   - Backend verifies credentials, issues JWT as HttpOnly cookie.
3. **Persistent Auth:**
   - Frontend checks `/api/protected` on every route/page load.
   - Backend verifies JWT from cookie and user existence.
   - If valid, user stays logged in; if not, user is logged out.
4. **Logout:**
   - Frontend calls logout endpoint, backend clears cookie.
5. **OAuth & Password Reset:**
   - UI in place; backend ready for integration.

---

## 🌐 Deployment

- **Frontend:** Deployed to Vercel (`client/vercel.json` ensures SPA routing).
- **Backend:** Deployed to Render.com (Node.js service).
- **MongoDB Atlas:** Cloud database for all user data.

---

## 📝 How to Run Locally

1. Clone the repo and install dependencies in both `client` and `server`:
   ```bash
   cd client && npm install
   cd ../server && npm install
   ```
2. Set up your environment variables in `server/config.env` (MongoDB URI, JWT secret, etc).
3. Start the backend:
   ```bash
   cd server && npm run dev
   ```
4. Start the frontend:
   ```bash
   cd ../client && npm run dev
   ```
5. Visit `http://localhost:5173` in your browser.

---

## 📦 Major Features Implemented
- Secure, persistent authentication with JWT (HttpOnly cookies)
- Password hashing with bcrypt
- Responsive, modern dark-themed UI
- SPA routing for all frontend routes
- User registration, login, logout
- UI for Google OAuth and password reset (backend ready for integration)
- Deployed and production-ready for real users

---

## 💡 Next Steps / Improvements
- Integrate Google OAuth (backend)
- Implement password reset with SendGrid
- Add email verification
- Add rate limiting and brute-force protection
- Add user profile and settings

---

**Made with ❤️ by Abhigyan Raj and the Veraawell team.** 