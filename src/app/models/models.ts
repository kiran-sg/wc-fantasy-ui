export interface Team {
  id: number;
  name: string;
  code: string;
  group: string;
  flagUrl: string;
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

export interface AppUser {
  id: number;
  username: string;
  displayName: string;
  totalPoints: number;
  isAdmin?: boolean;
  location?: string;
}

export interface RoundEntry {
  userId: number;
  username: string;
  displayName: string;
  roundPoints: number;
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
  roundStart: string | null; // ISO datetime UTC — null means not yet scheduled
}

export interface UserTransferRecord {
  id?: number;
  stage: string;
  transfersMade: number;
  penaltyPoints: number;
}
