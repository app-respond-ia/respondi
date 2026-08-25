export const USER_COLORS = [
  { id: 'brand', bg: 'bg-brand-600', text: 'text-brand-700', bgLight: 'bg-brand-100' },
  { id: 'blue', bg: 'bg-blue-600', text: 'text-blue-700', bgLight: 'bg-blue-100' },
  { id: 'indigo', bg: 'bg-indigo-600', text: 'text-indigo-700', bgLight: 'bg-indigo-100' },
  { id: 'violet', bg: 'bg-violet-600', text: 'text-violet-700', bgLight: 'bg-violet-100' },
  { id: 'fuchsia', bg: 'bg-fuchsia-600', text: 'text-fuchsia-700', bgLight: 'bg-fuchsia-100' },
  { id: 'rose', bg: 'bg-rose-600', text: 'text-rose-700', bgLight: 'bg-rose-100' },
  { id: 'red', bg: 'bg-red-600', text: 'text-red-700', bgLight: 'bg-red-100' },
  { id: 'orange', bg: 'bg-orange-600', text: 'text-orange-700', bgLight: 'bg-orange-100' },
  { id: 'amber', bg: 'bg-amber-600', text: 'text-amber-700', bgLight: 'bg-amber-100' },
  { id: 'emerald', bg: 'bg-emerald-600', text: 'text-emerald-700', bgLight: 'bg-emerald-100' },
  { id: 'teal', bg: 'bg-teal-600', text: 'text-teal-700', bgLight: 'bg-teal-100' },
  { id: 'cyan', bg: 'bg-cyan-600', text: 'text-cyan-700', bgLight: 'bg-cyan-100' }
]

function getDeterministicIndex(id: string, max: number): number {
  if (!id) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % max;
}

export function getUserColorObject(userId: string, overrideColor?: string | null) {
  if (overrideColor) {
    const found = USER_COLORS.find(c => c.id === overrideColor)
    if (found) return found
  }
  const index = getDeterministicIndex(userId, USER_COLORS.length)
  return USER_COLORS[index]
}
