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
}

export interface Match {
  id: number;
  teamA: Team;
  teamB: Team;
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
  captain: Player;
  pointsEarned: number;
  locked: boolean;
}

export interface AppUser {
  id: number;
  username: string;
  displayName: string;
  totalPoints: number;
}
