export interface Team {
  id: number;
  name: string;
  code: string;
  group: string;
  flagUrl: string;
  eliminated?: boolean;
}

export interface Player {
  id: number;
  name: string;
  position: string;
  team: Team;
  jerseyNumber: number;
  photoUrl: string;
  price: number;
  fifaPlayerName?: string;
  totalPoints?: number;
}

export interface Match {
  id: number;
  teamA: Team | null;
  teamB: Team | null;
  teamALabel: string | null;
  teamBLabel: string | null;
  matchNumber: number | null;
  matchTime: string;
  venue: string;
  stage: string;
  status: string;
  scoreA: number;
  scoreB: number;
}

export interface UserSquad {
  id: number;
  userId: number;
  match: Match;
  players: Player[];
  bench: Player[];
  captain: Player;
  viceCaptain: Player;
  pointsEarned: number;
  locked: boolean;
  manualChangesMade: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  user: AppUser;
}

export interface AppUser {
  id: number;
  username: string;
  displayName: string;
  totalPoints: number;
  isAdmin?: boolean;
  location?: string;
}

export interface UserTeam {
  id: number;
  user: AppUser;
  stage: string;
  formation: string;
  starters: Player[];
  bench: Player[];
  captain: Player;
  viceCaptain: Player;
  manualChangesMade: boolean;
  transfersMadeThisStage: number;
  penaltyPoints: number;
}

export interface UserTeamMatchPoints {
  id: number;
  match: Match;
  pointsEarned: number;
  stage: string;
}

export interface RoundConfig {
  stage: string;
  freeTransfers: number;
  countryLimit: number;
  windowOpenHour: number;
  windowCloseHour: number;
  windowTimezone: string;
  roundStart: string | null;
  fifaRoundStart: string | null; // actual first FIFA match kickoff for this round (IST)
  isRoundClosed: boolean;        // admin-set: true once round scores are settled
}

export interface WindowStatus {
  open: boolean;
  message: string;
  stage: string;
}

export interface UserTransferRecord {
  id?: number;
  stage: string;
  transfersMade: number;
  penaltyPoints?: number;
}

export interface UserTeamSnapshot {
  id: number;
  stage: string;
  formation: string;
  starters: Player[];
  bench: Player[];
  captain?: Player;
  viceCaptain?: Player;
}
