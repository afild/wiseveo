interface MemberIds { groupIds: string[]; categoryIds: string[] }
interface GroupLike { id: string; categories: { id: string }[] }

/** Um custom card que inclui um grupo E uma categoria desse grupo contaria o
 * mesmo gasto duas vezes; a categoria redundante é descartada da agregação. */
export function dedupCustomCardMembers(card: MemberIds, groups: GroupLike[]): MemberIds {
  const coveredCatIds = new Set(
    groups.filter((g) => card.groupIds.includes(g.id)).flatMap((g) => g.categories.map((c) => c.id))
  )
  return {
    groupIds: card.groupIds,
    categoryIds: card.categoryIds.filter((id) => !coveredCatIds.has(id)),
  }
}
