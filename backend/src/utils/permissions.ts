import db from '../db.ts'

export async function hasPermission(userId: string, sheetId: string, minRole: 'viewer' | 'editor') {
  // Fetch the users role for sheet in question
  const perm = await db('permissions')
    .where({ user_id: userId, sheet_id: sheetId })
    .first();
  
  if (!perm) return false; //return false if no role defined

  // Define role hierarchy
  const roles = ['viewer', 'editor']; // order matching hierarchy level 0 = viewer, 1 = editor
  return roles.indexOf(perm.role) >= roles.indexOf(minRole); // return true if role level index is bigger than minimum required Role level for action
}