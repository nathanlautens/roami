export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type Vibe = 'quiet' | 'drinks' | 'food' | 'active' | 'chill' | 'chaos';
export type Response = 'in' | 'maybe' | 'cant';

export type Roam = {
  id: string;
  host_id: string;
  what: string;
  vibe: Vibe | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  max_spots: number | null;
  status: 'live' | 'up_for_grabs' | 'cancelled';
  bail_note: string | null;
  created_at: string;
  host?: Profile | null;
};

export type Invite = {
  roam_id: string;
  user_id: string;
  response: Response | null;
  note: string | null;
  responded_at: string | null;
  profile?: Profile | null;
};

export type Crew = {
  id: string;
  name: string;
  members: Profile[];
  lastRoamedAt: string | null;
};

export type InviteRequest = {
  id: string;
  roam_id: string;
  requester_id: string;
  invitee_id: string;
  status: 'pending' | 'approved' | 'declined';
  requester?: Profile | null;
  invitee?: Profile | null;
};
