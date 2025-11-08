import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { OrgMembership, OrgRole, AppUser } from "./types";

const MEMBERSHIPS_COLLECTION = "orgMemberships";

// Create membership (id pattern: `${orgId}_${userId}` for deterministic lookups)
export async function upsertOrgMembership(params: {
  orgId: string;
  user: AppUser;
  orgRole: OrgRole;
  departmentIds?: string[];
  active?: boolean;
}) {
  const { orgId, user, orgRole, departmentIds = [], active = true } = params;
  const userId = (user as any).uid || (user as any).id; // support both shapes during transition
  const id = `${orgId}_${userId}`;
  const ref = doc(collection(db, MEMBERSHIPS_COLLECTION), id);
  const now = Timestamp.now();
  const payload: OrgMembership = {
    orgId,
    userId,
    orgRole,
    departmentIds,
    active,
    displayName: user.displayName || user.email || "Member",
    photoURL: user.photoURL || null,
    email: (user as any).email || null,
    createdAt: now,
    updatedAt: now,
  } as OrgMembership;
  await setDoc(ref, payload, { merge: true });
  return payload;
}

export async function listOrgMemberships(orgId: string) {
  const q = query(
    collection(db, MEMBERSHIPS_COLLECTION),
    where("orgId", "==", orgId),
    where("active", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as OrgMembership);
}

export async function listOrgMembersLight(orgId: string) {
  // Minimal projection (Firetore doesn't support select – return full doc but typed light)
  return listOrgMemberships(orgId);
}

// Replace a departmentId in all membership docs for an org
export async function renameDepartmentInMemberships(
  orgId: string,
  oldDepartmentId: string,
  newDepartmentId: string
) {
  // Find memberships that reference the old department
  const q = query(
    collection(db, MEMBERSHIPS_COLLECTION),
    where("orgId", "==", orgId),
    where("departmentIds", "array-contains", oldDepartmentId)
  );
  const snap = await getDocs(q);
  const updates: Promise<any>[] = [];
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as OrgMembership;
    const next = (data.departmentIds || []).map((d) =>
      d === oldDepartmentId ? newDepartmentId : d
    );
    updates.push(
      updateDoc(docSnap.ref, {
        departmentIds: next,
        updatedAt: Timestamp.now(),
      })
    );
  });
  await Promise.all(updates);
}

// Remove a departmentId from all membership docs for an org
export async function removeDepartmentFromMemberships(
  orgId: string,
  departmentId: string
) {
  // Find memberships that reference the department
  const q = query(
    collection(db, MEMBERSHIPS_COLLECTION),
    where("orgId", "==", orgId),
    where("departmentIds", "array-contains", departmentId)
  );
  const snap = await getDocs(q);
  const updates: Promise<any>[] = [];
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as OrgMembership;
    const next = (data.departmentIds || []).filter((d) => d !== departmentId);
    updates.push(
      updateDoc(docSnap.ref, {
        departmentIds: next,
        updatedAt: Timestamp.now(),
      })
    );
  });
  await Promise.all(updates);
}

// Attach or detach a department from a membership
export async function updateMembershipDepartments(
  orgId: string,
  userId: string,
  departmentIds: string[]
) {
  const id = `${orgId}_${userId}`;
  const ref = doc(collection(db, MEMBERSHIPS_COLLECTION), id);
  await updateDoc(ref, { departmentIds, updatedAt: Timestamp.now() });
}

// Deactivate a membership when a user leaves an organization
export async function deactivateOrgMembership(orgId: string, userId: string) {
  const id = `${orgId}_${userId}`;
  const ref = doc(collection(db, MEMBERSHIPS_COLLECTION), id);
  try {
    await updateDoc(ref, {
      active: false,
      departmentIds: [],
      updatedAt: Timestamp.now(),
    });
  } catch (e) {
    // If the membership doc doesn't exist, ignore
    console.warn("deactivateOrgMembership: membership doc not found or already removed", {
      orgId,
      userId,
      error: e,
    });
  }
}

// Backfill helper: ensures each orgRoles entry has membership doc
export async function backfillMembershipsForUser(user: AppUser) {
  if (!user.orgRoles) return [];
  const results: OrgMembership[] = [];
  for (const or of user.orgRoles) {
    results.push(
      await upsertOrgMembership({
        orgId: or.orgId,
        user,
        orgRole: { orgId: or.orgId, orgRole: or.orgRole } as any, // minimal mapping
      })
    );
  }
  return results;
}

// Future: add pagination, indexing, and role filtering helpers
export const _internal = { MEMBERSHIPS_COLLECTION };
