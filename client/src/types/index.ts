// Shared TypeScript Types for the entire application

// ============================================================================
// User Types
// ============================================================================

export interface User {
  userId: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'patient' | 'doctor' | 'admin' | 'super-admin';
  profileCompleted: boolean;
}

// ============================================================================
// Session Types
// ============================================================================

export interface Session {
  _id: string;
  sessionDate: string;
  sessionTime: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  sessionType: 'regular' | 'immediate' | 'follow-up';
  patientId: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  doctorId: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  meetingLink?: string;
  price: number;
  duration?: number;
}

// ============================================================================
// Report Types
// ============================================================================

export interface Report {
  _id: string;
  title: string;
  reportType: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  doctorId: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  patientId: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  sessionId: {
    _id: string;
    sessionDate: string;
    sessionTime: string;
  };
  viewedByPatient: boolean;
}

// ============================================================================
// Task Types
// ============================================================================

export interface Task {
  _id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed';
  doctorId: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  patientId: string;
  sessionId?: string;
  createdAt: string;
  updatedAt?: string;
}

// ============================================================================
// Journal Types
// ============================================================================

export interface JournalEntry {
  _id: string;
  title: string;
  content: string;
  mood?: string;
  tags?: string[];
  patientId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Doctor Types
// ============================================================================

export interface Doctor {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  specialization: string[];
  experience: number;
  qualification: string[];
  languages: string[];
  treatsFor: string[];
  pricing: {
    min: number;
    max: number;
  };
  profileImage?: string;
  bio?: string;
  isOnline: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiError {
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}

// ============================================================================
// Dashboard Data Types
// ============================================================================

export interface DashboardData {
  reports: Report[];
  tasks: Task[];
  journal: JournalEntry[];
  sessions: Session[];
  unreadCount: number;
}

// ============================================================================
// Chat/Message Types
// ============================================================================

export interface ChatMessage {
  _id: string;
  senderId: string;
  receiverId: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface ChatConversation {
  userId: string;
  userName: string;
  userRole: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

// ============================================================================
// Form Data Types
// ============================================================================

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'patient' | 'doctor';
}

export interface BookingData {
  doctorId: string;
  sessionDate: string;
  sessionTime: string;
  sessionType: 'regular' | 'immediate';
  notes?: string;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

export interface ModalState {
  isOpen: boolean;
  data?: any;
}
