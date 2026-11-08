/** Column lists shared by Supabase queries, so every screen asks for the same shape. */

export const PROFILE = 'id, display_name, avatar_url';

/** One row of roam_invites (see `Invite`), without the profile. */
export const INVITE_FIELDS = 'roam_id, user_id, response, note, responded_at';

/** A whole Roam plus its host's profile. */
export const ROAM_WITH_HOST = `*, host:profiles!roams_host_id_fkey(${PROFILE})`;
