export interface Tournament {
  id?: string;
  name: string;
  organizerId: string;
  licenseId?: string; // Link to the specific license used to create this tournament
  date: string;
  venue: string;
  numCourts: number;
  courtNames?: Record<number, string>;
  pin: string; // Legacy PIN
  umpirePin: string;
  audiencePin: string;
  logoUrl?: string;
  createdAt: string;
}

export interface Player {
  id?: string;
  name: string;
  tournamentId: string;
  category: 'singles' | 'doubles' | 'mixed';
  isTeam?: boolean;
  teamName?: string;
  members?: string[];
  stats?: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    totalPoints: number;
  };
}

export interface Match {
  id?: string;
  tournamentId: string;
  courtNumber: number;
  player1: string;
  player2: string;
  player1Id?: string;
  player2Id?: string;
  score1: number;
  score2: number;
  status: 'scheduled' | 'ongoing' | 'completed';
  umpireId?: string;
  umpireName?: string;
  isDoubles: boolean;
  server: 'p1' | 'p2';
  sets: { s1: number; s2: number }[];
  currentSet: number;
  lastUpdated?: string;
  stage?: 'group' | 'knockout';
  groupName?: string;
  roundName?: string;
  category?: 'singles' | 'doubles' | 'mixed';
}

export interface Umpire {
  id?: string;
  name: string;
  tournamentId: string;
  isAvailable: boolean;
  preferredCourts?: number[];
}

export interface License {
  id?: string;
  organizerEmail: string;
  accessPin: string;
  type: '1day' | 'multi' | 'monthly' | 'annual';
  validUntil: string;
  createdAt: string;
  status: 'active' | 'expired' | 'pending';
  usedByUid?: string;
  lastLoginAt?: string;
}

export interface AppUser {
  uid: string;
  email: string;
  role: 'superadmin' | 'organizer' | 'user';
  licenseId?: string;
  licenseValidUntil?: string;
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  timestamp: string;
  read: boolean;
}
