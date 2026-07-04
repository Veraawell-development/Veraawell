# Frontend Architecture Refactoring Plan

This document outlines a phased, deep-dive implementation plan to refactor the frontend codebase. As requested, we will execute this plan **issue by issue, end-to-end (E2E)**, moving to the next only when the previous one is perfectly resolved and tested.

## User Review Required
> [!IMPORTANT]
> Please review the sequence of these phases. I recommend starting with Phase 1 (Routing & Layouts) because it provides immediate performance benefits and cleans up `App.tsx`, which touches everything else. Let me know if you approve this plan or want to reprioritize.

---

## Phase 1: Routing Architecture & Code Splitting (Performance & Maintainability)

**The Issue:** `App.tsx` is a monolithic file that synchronously imports over 50 pages. This forces the browser to download the entire application upfront. Furthermore, it uses a massive 30-condition `location.pathname === ...` check to determine whether to show the `<Navbar>` and `<Footer>`.

**Implementation Steps:**
1. **Create Layout Components:**
   - Create `src/layouts/MainLayout.tsx` (includes Navbar & Footer, used for public pages).
   - Create `src/layouts/AuthLayout.tsx` (no Navbar/Footer, used for login/signup).
   - Create `src/layouts/DashboardLayout.tsx` (sidebar/specific headers for authenticated dashboards).
2. **Implement React Router Layouts:**
   - Refactor the `<Routes>` in `App.tsx` to use `<Route element={<MainLayout />}>` wrappers.
   - Completely delete the massive `isAuthRoute` and `isVideoCallRoute` path-checking logic.
3. **Implement Route-Level Code Splitting:**
   - Replace all static imports (e.g., `import DoctorDashboard from './pages/DoctorDashboard';`) with lazy imports (e.g., `const DoctorDashboard = React.lazy(() => import('./pages/DoctorDashboard'));`).
   - Wrap the `<Routes>` block in `<Suspense fallback={<LoadingScreen />}>`.
4. **Verification:**
   - Ensure the app loads. Verify the Navbar appears on the correct pages and disappears on auth/dashboard pages automatically via the new Layout logic.
   - Check the Vite build output to ensure code is split into smaller chunks.

---

## Phase 2: Folder Structure Reorganization (Organization)

**The Issue:** The `src/pages` and `src/components` directories are completely flat, containing 55 and 34 files respectively. Marketing pages are mixed with admin dashboards and UI primitives are mixed with massive domain modals.

**Implementation Steps:**
1. **Reorganize Pages (`src/pages/`):**
   - Create subdirectories: `/patient`, `/doctor`, `/admin`, `/auth`, `/public`.
   - Move all 55 page files into their respective domain folders.
2. **Reorganize Components (`src/components/`):**
   - Create/utilize subdirectories: `/ui` (Toast, Buttons, Inputs), `/modals` (all massive modal files), `/layout` (Navbar, Footer).
   - Group domain-specific components (e.g., `DoctorCard`, `DoctorSidebar`) into a `/doctor` components folder.
3. **Delete Dead Code:**
   - Remove `AboutPage_git_backup.tsx`, `AdminDashboardOld.tsx`, and any unused files.
4. **Update Imports:**
   - Run a global sweep to fix all broken import paths caused by the reorganization.
5. **Verification:**
   - Ensure the app compiles with zero missing module errors.

---

## Phase 3: API Integration & Data Fetching (Reliability & Caching)

**The Issue:** The app relies on raw `fetch()` calls scattered manually inside UI components. This leads to massive boilerplate, lack of centralized error handling (like 401 redirects), zero caching (or manual `localStorage` hacks), and waterfall loading delays.

**Implementation Steps:**
1. **Setup Centralized API Client (Axios):**
   - Install `axios`.
   - Create `src/lib/axios.ts` to define an Axios instance with the base URL.
   - Add **Interceptors**: Automatically inject the Authorization token into headers. Automatically intercept 401 errors to trigger a global logout function.
2. **Setup React Query:**
   - Install `@tanstack/react-query`.
   - Wrap the app in `<QueryClientProvider>` inside `main.tsx`.
3. **E2E Refactor of a Single Domain (e.g., Doctor Dashboard):**
   - Replace raw `fetch` calls in `DoctorDashboard.tsx` with Axios.
   - Wrap the Axios calls in custom hooks (e.g., `useDoctorStats()`, `useRecentReports()`) using `useQuery`.
   - Delete the custom `localStorage` pseudo-caching logic in `DoctorDashboard.tsx` since React Query handles caching automatically.
4. **Verification:**
   - Open the Doctor Dashboard. Verify data loads seamlessly, caches locally on navigation, and boilerplate is significantly reduced.

*(Note: Once Phase 3 is proven on one dashboard, we can systematically roll it out to the rest of the application).*

---

## Phase 4: Component Decoupling & The "God Object" Anti-Pattern (Scalability)

**The Issue:** Massive components like `PatientCalendarModal` (600+ lines) mix complex business logic (calculating time differences, checking session joinability) with UI rendering and state management.

**Implementation Steps:**
1. **Extract Business Logic:**
   - Move pure functions like `isSessionJoinable()`, `getDaysInMonth()`, and `getSessionDotColor()` out of the React components and into `src/utils/sessionUtils.ts`.
2. **Extract State Logic:**
   - Move complex `useState` and filtering logic into custom hooks (e.g., `useCalendarFilters()`).
3. **Component Splitting:**
   - Break down massive components into smaller child components (e.g., split `PatientCalendarModal` into `<CalendarHeader>`, `<CalendarGrid>`, and `<UpcomingSessionsList>`).
4. **Verification:**
   - Ensure the UI behaves exactly identically as before, but the codebase is highly modular and testable.

---

## Open Questions
- Do you approve starting with **Phase 1 (Routing & Layouts)** first?
- Are there any specific libraries (like Axios or React Query) that you are opposed to adding to the project, or are you fully on board with these standard industry tools?
