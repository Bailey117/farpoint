/** Shared shapes for the reference sheet, arrivals and rules. */

/** A date as YYYY-MM-DD (string comparison orders correctly). */
export type IsoDate = string;
/** A time of day as HH:MM. */
export type Clock = string;

/**
 * Roster status. 'offworld' and 'overdue' teams may come home; 'home' teams
 * cannot be arriving; 'missing' teams must be refused even with a valid code.
 */
export type TeamStatus = 'offworld' | 'overdue' | 'home' | 'missing';

export interface Team {
  id: string;
  /** Callsign shown everywhere, e.g. "Ashgrove". */
  name: string;
  status: TeamStatus;
  /** Short roster remark, e.g. "Overdue 2 days". */
  remark?: string;
}

export interface CodeEntry {
  code: string;
  teamId: string;
  expires: IsoDate;
}

export type BulletinEffect =
  | { kind: 'recall'; teamId: string }
  | { kind: 'cancel-recall'; teamId: string }
  | { kind: 'duress'; digit: number };

export interface Bulletin {
  time: Clock;
  text: string;
  effect?: BulletinEffect;
}

/** Everything on the attendant's desk for one day. */
export interface Reference {
  day: number;
  date: IsoDate;
  roster: Team[];
  codes: CodeEntry[];
  bulletins: Bulletin[];
}

export type RuleId = 'unlisted' | 'expired' | 'not-offworld' | 'missing' | 'duress' | 'forged' | 'recalled';

/** What an arrival was generated to be: let through, or caught by one rule. */
export type Intent = 'valid' | RuleId;

export interface Arrival {
  code: string;
  /** Authentication digit sent with the code (matters from day 5). */
  auth: number;
  /** The team the traveller claims to be. */
  teamId: string;
  date: IsoDate;
  time: Clock;
  intent: Intent;
  /** Set when the arrival is a story beat rather than a random draw. */
  story?: string;
}
