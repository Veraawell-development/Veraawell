/** Shapes returned by the admin API, as far as the console reads them. */

export interface PendingUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
  approvalStatus: 'pending' | 'approved' | 'rejected' | string;
  rejectionReason?: string;
  specialization?: string;
  licenseNumber?: string;
  jobRole?: string;
  professionalMessage?: string;
  phoneNumber?: string;
  countryCode?: string;
  gender?: string;
  heardAboutUs?: string;
  dateOfBirth?: string;
  documents?: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    cloudinaryPublicId: string;
    uploadedAt: string;
  }[];
  /** The doctor's profile, on the all-doctors list. Counters are admin-only. */
  profile?: {
    lateCount?: number;
    noShowCount?: number;
    cancellationCount?: number;
  } | null;
}

export interface Statistics {
  doctors: { pending: number; approved: number; rejected: number; total: number };
  patients: { total: number };
  admins?: { pending: number; approved: number; rejected: number; total: number };
}

export interface Analytics {
  sessions: { total: number; completed: number; cancelled: number; upcoming: number; last30Days: number; last7Days: number };
  revenue: { total: number; last30Days: number; averagePerSession: string | number };
  content: { reports: number; tasks: number; completedTasks: number };
  growth: { newPatients30Days: number; newDoctors30Days: number };
  topDoctors: Array<{ name: string; sessionCount: number }>;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
