import { z } from 'zod';

// Client-side validation. The database enforces the same limits with
// CHECK constraints, so these are for friendly messages, not security.

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Choose a rating from 1 to 5').max(5),
  body: z
    .string()
    .trim()
    .min(20, 'Please write at least 20 characters')
    .max(1500, 'Keep it under 1,500 characters')
    .refine((s) => !/(\+?\d[\d\s-]{8,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)/.test(s), 'Please don’t include phone numbers or email addresses'),
  visitedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .refine((d) => d == null || new Date(d) <= new Date(), 'Visit date can’t be in the future'),
});

export const reportSchema = z.object({
  reportType: z.enum(['facility', 'menu_price', 'opening_hours', 'noise', 'other']),
  facility: z.string().nullable(),
  reportedValue: z.string().trim().max(120).nullable(),
  details: z.string().trim().min(10, 'Tell us a little more (10+ characters)').max(1000),
});

export const collectionNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the collection a name')
  .max(60, 'Keep names under 60 characters');

export const searchQuerySchema = z.string().trim().max(300, 'Search is limited to 300 characters');

export const credentialsSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
});

export const profileSchema = z.object({
  displayName: z.string().trim().max(40, 'Keep it under 40 characters').nullable(),
  preferredBudget: z.enum(['under150', '150to300', '300to500', '500to1000', 'flexible']).nullable(),
  preferredNeighbourhood: z.string().nullable(),
  dietaryPreferences: z.array(z.string().max(30)).max(8),
});

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Please check your input';
}
