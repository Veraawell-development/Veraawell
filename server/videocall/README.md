# Video Call System for Veraawell

## Overview
This module provides WebRTC-based video calling functionality for the Veraawell mental health platform, enabling secure video sessions between patients and mental health professionals.

## Architecture

### Core Components
- **WebRTC Signaling Server**: Handles peer-to-peer connection establishment
- **Room Management**: Manages video call sessions and participants
- **Session Recording**: Optional session recording for therapy notes
- **Security & Authentication**: Ensures only authorized users can join calls

### Folder Structure
```
videocall/
├── config/           # Configuration files
├── controllers/      # API route handlers
├── middleware/       # Authentication and validation middleware
├── models/          # Database schemas for video calls
├── services/        # Business logic and utilities
├── sockets/         # Socket.IO event handlers
├── types/           # TypeScript type definitions
└── utils/           # Helper functions and constants
```

## Features
- **Peer-to-Peer Video Calls**: Direct WebRTC connections
- **Room-based Sessions**: Secure, private therapy rooms
- **Screen Sharing**: For document sharing during sessions
- **Session Recording**: Optional recording with consent
- **Connection Quality Monitoring**: Real-time connection statistics
- **Reconnection Handling**: Automatic reconnection on network issues
- **Mobile Support**: Responsive design for mobile devices

## Security Features
- **JWT Authentication**: Secure user verification
- **Room Access Control**: Role-based room access
- **End-to-End Encryption**: WebRTC native encryption
- **Session Logging**: Audit trails for compliance
- **HIPAA Compliance**: Healthcare data protection

## Usage
This is a demo implementation showcasing the video call infrastructure. 
It's not connected to the main application but provides a complete foundation for integration.
