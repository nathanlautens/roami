import { z } from 'zod';

import { VIBES, WHENS } from './roams';

// Hermes can't compile code at runtime, so skip Zod's `new Function` fast path.
z.config({ jitless: true });

// Length limits match the database check constraints.
const text = (max: number) => z.string().trim().max(max);
const required = (max: number, message: string) => text(max).min(1, message);
const ids = z.array(z.string());

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("That doesn't look like an email.")),
  password: z.string(),
  code: z.string(),
});

export const profileSchema = z.object({
  displayName: required(30, 'What do your friends call you?'),
  avatarUrl: z.string().nullable(),
});

export const circleSchema = z.object({ name: required(40, 'Give it a name.'), members: ids });

export const friendCodeSchema = z.object({
  code: z
    .string()
    .transform((s) => s.toLowerCase().replace(/[^0-9a-f]/g, ''))
    .pipe(z.string().length(8, 'Friend codes are 8 letters and numbers.')),
});

export const REPORT_REASONS = [
  { id: 'harassment', label: 'Being mean or harassing' },
  { id: 'inappropriate', label: 'Inappropriate stuff' },
  { id: 'spam', label: 'Spam' },
  { id: 'fake', label: 'Fake account' },
  { id: 'other', label: 'Something else' },
] as const;

export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS.map((r) => r.id), "Pick what's going on."),
  details: text(500),
});

export const noteSchema = z.object({ note: text(80) });

export const pitchSchema = z.object({ text: required(60, 'Pitch something.') });

export const voteSchema = z.object({ nights: ids, vibes: z.array(z.enum(VIBES.map((v) => v.id))) });

export const sendSchema = z
  .object({
    mode: z.enum(['now', 'find']),
    circleIds: ids,
    people: ids,
    what: text(80),
    vibe: z.enum(VIBES.map((v) => v.id)).nullable(),
    when: z.enum(WHENS.map((w) => w.id)),
    where: text(80),
    spots: z.number().int().min(1).max(20).nullable(),
    nights: ids.max(7, 'Seven nights max. Commitment issues?'),
    buzzerId: z.string().nullable(),
    idea: text(60),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'now' && !v.what) ctx.addIssue({ code: 'custom', path: ['what'], message: "What's the plan?" });
    if (v.mode === 'find' && !v.nights.length) ctx.addIssue({ code: 'custom', path: ['nights'], message: 'Pick your nights.' });
  });
