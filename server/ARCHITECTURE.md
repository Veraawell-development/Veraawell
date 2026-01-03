# Backend Architecture Documentation

## Overview

The backend has been refactored from a monolithic `index.js` file into a well-organized, modular structure while maintaining a monolithic architecture. This improves maintainability, testability, and scalability.

## Directory Structure

```
server/
├── app.js                    # Express application setup
├── server.js                 # HTTP server + Socket.IO initialization
├── index.js.deprecated       # DEPRECATED (Migration completed 2026-01-03)
├── config/                   # Configuration modules
│   ├── environment.js        # Environment variable validation
│   ├── database.js           # MongoDB connection & session store
│   ├── auth.js               # JWT, OAuth, cookie configuration
│   └── constants.js          # Application constants
├── middleware/               # Express middleware
│   ├── auth.middleware.js    # Centralized JWT authentication
│   ├── error.middleware.js   # Global error handler
│   ├── rateLimit.middleware.js # Rate limiting configuration
│   ├── validation.middleware.js # Request validation
│   └── adminAuth.js          # Admin authentication (existing)
├── services/                 # Business logic services
│   ├── auth.service.js       # Authentication business logic
│   ├── email.service.js      # Email sending functionality
│   └── oauth.service.js      # OAuth handling
├── controllers/              # Route handlers
│   ├── auth.controller.js    # Authentication routes
│   └── profile.controller.js # Profile routes
├── routes/                   # Route definitions (existing)
│   ├── admin/
│   ├── sessions.js
│   ├── chat.js
│   └── ...
├── models/                   # Mongoose models (existing)
├── socket/                   # Socket.IO handlers (existing)
├── utils/                     # Utility functions
│   ├── logger.js             # Centralized logging
│   └── errors.js             # Custom error classes
└── videocall/                # Video call module (existing)
```

## Key Improvements

### 1. Configuration Management (`config/`)
- **environment.js**: Validates required environment variables on startup
- **database.js**: Centralized MongoDB connection and session store
- **auth.js**: JWT secrets, OAuth config, cookie settings (NO hardcoded fallbacks in production)
- **constants.js**: All application constants in one place

### 2. Centralized Authentication (`middleware/auth.middleware.js`)
- Single source of truth for token verification
- Supports both cookies and Authorization headers
- Handles admin and regular user tokens
- Consistent error handling

### 3. Error Handling (`middleware/error.middleware.js`)
- Global error handler
- Custom error classes for different error types
- Consistent error response format
- Proper error logging

### 4. Business Logic Separation (`services/`)
- **auth.service.js**: All authentication logic (register, login, password reset)
- **email.service.js**: Email sending functionality
- **oauth.service.js**: OAuth flow handling

### 5. Request Validation (`middleware/validation.middleware.js`)
- Input validation for registration, login, password reset
- Password strength validation
- Email format validation

### 6. Logging (`utils/logger.js`)
- Centralized logging with levels
- Context-aware logging
- Production/development modes

## Migration from index.js

**Status: COMPLETED (2026-01-03)**

The old monolithic `index.js` has been successfully split into a modular architecture:

1. **app.js**: Express app configuration, middleware setup, routes
2. **server.js**: HTTP server creation, Socket.IO setup, database connection, startup
3. **config/***: All configuration modules
4. **middleware/***: Centralized middleware
5. **services/***: Business logic layer
6. **controllers/***: Route handlers

The legacy `index.js` file has been deprecated and renamed to `index.js.deprecated`.

## Usage

### Starting the Server

```bash
# Development
npm run dev

# Production
npm start
```

### Environment Variables

Required (validated on startup):
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret (required in production)
- `SESSION_SECRET` - Session encryption secret
- `FRONTEND_URL` - Frontend URL for redirects

Optional:
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `EMAIL_USER` - Email service username
- `EMAIL_PASS` - Email service password
- `ADMIN_JWT_SECRET` - Admin JWT secret (defaults to JWT_SECRET)
- `PORT` - Server port (defaults to 8000)

## Authentication Flow

1. User logs in → `authController.login`
2. Service validates → `authService.authenticateUser`
3. Token generated → `authService.generateToken`
4. Cookie set → `authService.setAuthCookie`
5. Protected routes → `verifyToken` middleware validates

## Error Handling

All errors are handled by the global error handler:

```javascript
// Custom errors
throw new AuthenticationError('Invalid credentials');
throw new ValidationError('Validation failed', { field: 'error' });
throw new NotFoundError('User');

// Automatic handling
- 401 for AuthenticationError
- 403 for AuthorizationError
- 400 for ValidationError
- 404 for NotFoundError
- 500 for unexpected errors
```

## Adding New Routes

1. Create controller in `controllers/`
2. Add route in `app.js`:
   ```javascript
   app.get('/api/route', verifyToken, controller.handler);
   ```
3. Use `asyncHandler` wrapper for async controllers

## Security Improvements

1. No hardcoded JWT secrets (fails fast in production)
2. Centralized authentication
3. Input validation
4. Rate limiting
5. Error handling without exposing internals
6. Secure cookie configuration

## Next Steps

1. Remove old `index.js` after verification
2. Update all route files to use centralized `verifyToken`
3. Add TypeScript (future)
4. Add comprehensive tests (future)
5. Implement refresh tokens (future)

## Notes

- The architecture remains **monolithic** (single process)
- All modules are well-organized and maintainable
- Easy to extend with new features
- Ready for future TypeScript migration
- Prepared for testing infrastructure
