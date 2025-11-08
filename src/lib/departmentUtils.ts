import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  writeBatch,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  Department,
  DepartmentTreeNode,
  DepartmentWithHierarchy,
  DepartmentQueryOptions,
  DepartmentPayload,
  AppUser,
  DisplayUser,
} from "./types";

/**
 * NESTED DEPARTMENTS UTILITY FUNCTIONS
 * Handles all database operations and tree manipulations for nested departments
 */

// **1. FETCHING DEPARTMENTS**

/**
 * Fetch all departments for an organization
 */
export async function fetchAllDepartments(
  orgId: string
): Promise<Department[]> {
  try {
    const q = query(
      collection(db, "departments"),
      where("orgId", "==", orgId),
      orderBy("level", "asc"),
      orderBy("name", "asc")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Department
    );
  } catch (error) {
    console.error("Error fetching departments:", error);
    throw new Error("Failed to fetch departments");
  }
}

/**
 * Fetch root departments (level 0) for an organization
 */
export async function fetchRootDepartments(
  orgId: string
): Promise<Department[]> {
  try {
    const q = query(
      collection(db, "departments"),
      where("orgId", "==", orgId),
      where("level", "==", 0),
      orderBy("name", "asc")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Department
    );
  } catch (error) {
    console.error("Error fetching root departments:", error);
    throw new Error("Failed to fetch root departments");
  }
}

/**
 * Fetch child departments of a specific parent
 */
export async function fetchChildDepartments(
  parentId: string,
  orgId?: string
): Promise<Department[]> {
  try {
    // Prefer server-side filtering by orgId as an additional safety guard.
    if (orgId) {
      try {
        const qWithOrg = query(
          collection(db, "departments"),
          where("orgId", "==", orgId),
          where("parentDepartmentId", "==", parentId),
          orderBy("name", "asc")
        );
        const snapshotWithOrg = await getDocs(qWithOrg);
        return snapshotWithOrg.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Department
        );
      } catch (e: any) {
        // Fallback if a composite index is missing: fetch by parent and filter in memory
        if (
          typeof e?.message === "string" &&
          e.message.includes("FAILED_PRECONDITION")
        ) {
          console.warn(
            "Missing composite index for (orgId, parentDepartmentId). Falling back to client-side filter.",
            e
          );
          const q = query(
            collection(db, "departments"),
            where("parentDepartmentId", "==", parentId),
            orderBy("name", "asc")
          );
          const snapshot = await getDocs(q);
          return snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as Department)
            .filter((d) => d.orgId === orgId);
        }
        throw e;
      }
    }

    // Original behavior when orgId is not provided
    const q = query(
      collection(db, "departments"),
      where("parentDepartmentId", "==", parentId),
      orderBy("name", "asc")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Department
    );
  } catch (error) {
    console.error("Error fetching child departments:", error);
    throw new Error("Failed to fetch child departments");
  }
}

/**
 * Fetch departments by path pattern (for efficient queries)
 */
export async function fetchDepartmentsByPath(
  orgId: string,
  pathPrefix: string
): Promise<Department[]> {
  try {
    const q = query(
      collection(db, "departments"),
      where("orgId", "==", orgId),
      where("path", ">=", pathPrefix),
      where("path", "<", pathPrefix + "\uf8ff"), // Unicode high character for range
      orderBy("path", "asc")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Department
    );
  } catch (error) {
    console.error("Error fetching departments by path:", error);
    throw new Error("Failed to fetch departments by path");
  }
}

// **2. TREE BUILDING**

/**
 * Build department tree from flat array
 */
export function buildDepartmentTree(
  departments: Department[]
): DepartmentTreeNode[] {
  const deptMap = new Map<string, DepartmentTreeNode>();
  const roots: DepartmentTreeNode[] = [];

  // Create nodes
  departments.forEach((dept) => {
    deptMap.set(dept.id, {
      department: dept,
      children: [],
      isExpanded: false,
    });
  });

  // Build tree structure
  departments.forEach((dept) => {
    const node = deptMap.get(dept.id)!;

    if (!dept.parentDepartmentId) {
      // Root department
      roots.push(node);
    } else {
      // Child department
      const parent = deptMap.get(dept.parentDepartmentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  });

  return roots;
}

/**
 * Flatten department tree to array with hierarchy info
 */
export function flattenDepartmentTree(
  tree: DepartmentTreeNode[]
): DepartmentWithHierarchy[] {
  const result: DepartmentWithHierarchy[] = [];

  function traverse(nodes: DepartmentTreeNode[], ancestors: Department[] = []) {
    nodes.forEach((node) => {
      const breadcrumb = [...ancestors, node.department]
        .map((d) => d.name)
        .join(" > ");

      result.push({
        ...node.department,
        breadcrumb,
        ancestors,
        depth: node.department.level,
      });

      if (node.children.length > 0) {
        traverse(node.children, [...ancestors, node.department]);
      }
    });
  }

  traverse(tree);
  return result;
}

// **3. CREATING DEPARTMENTS**

/**
 * Helper function to migrate a single department from legacy structure to new structure
 */
async function migrateDepartmentIfNeeded(
  departmentId: string,
  orgId: string
): Promise<Department | null> {
  try {
    console.log(`🔍 Checking department: ${departmentId} in org: ${orgId}`);

    // Check if department already exists in new structure
    const deptDoc = await getDoc(doc(db, "departments", departmentId));
    if (deptDoc.exists()) {
      const existing = { id: deptDoc.id, ...deptDoc.data() } as Department;
      if (existing.orgId === orgId) {
        console.log(
          `✅ Department ${departmentId} found in new structure for org ${orgId}`
        );
        return existing;
      } else {
        console.warn(
          `⚠️ Department ID collision: ${departmentId} belongs to different org (${existing.orgId}). Will create a new department for org ${orgId}.`
        );
        // fall through to legacy lookup and create a new doc with a unique ID
      }
    }

    console.log(
      `🔄 Department ${departmentId} not in new structure, checking legacy...`
    );

    // Try to find in organization's legacy structure
    const orgDoc = await getDoc(doc(db, "organizations", orgId));
    if (!orgDoc.exists()) {
      console.log(`❌ Organization ${orgId} not found`);
      return null;
    }

    const orgData = orgDoc.data();
    const legacyDepartments = (orgData as any).customDepartments || [];
    console.log(
      `📋 Found ${legacyDepartments.length} legacy departments:`,
      legacyDepartments.map((d: any) => `${d.id}: ${d.name}`)
    );

    const legacyDept = legacyDepartments.find(
      (d: any) => d.id === departmentId
    );

    if (!legacyDept) {
      console.log(
        `❌ Department ${departmentId} not found in legacy structure either`
      );
      console.log(
        `Available legacy departments:`,
        legacyDepartments.map((d: any) => d.id)
      );
      return null;
    }

    console.log(
      `🔄 Migrating department ${departmentId} from legacy to new structure`
    );

    // Migrate this department to new structure
    const now = Timestamp.now();
    const newDept: Omit<Department, "id"> = {
      name: legacyDept.name,
      description: legacyDept.description || "",
      orgId,
      memberIds: legacyDept.memberIds || [],
      controllerUserIds: legacyDept.controllerUserIds || [],
      // Use null instead of undefined for Firestore compatibility
      parentDepartmentId: null,
      path: "/",
      level: 0,
      childDepartmentIds: [],
      hasChildren: false,
      ancestorIds: [],
      createdAt: legacyDept.createdAt || now,
      updatedAt: now,
    };

    // Create in new structure with a new unique ID to avoid cross-org collisions
    const newDeptRef = doc(collection(db, "departments"));
    await setDoc(newDeptRef, newDept);

    console.log(
      `✅ Successfully migrated department ${departmentId} to new ID ${newDeptRef.id} for org ${orgId}`
    );

    return { id: newDeptRef.id, ...newDept };
  } catch (error) {
    console.error("Error migrating department:", error);
    return null;
  }
}

/**
 * Create a new department
 */
export async function createDepartment(
  orgId: string,
  payload: DepartmentPayload
): Promise<string> {
  try {
    let parentDept: Department | null = null;
    let level = 0;
    let path = "/";
    let ancestorIds: string[] = [];

    // If this is a child department, fetch parent info
    if (payload.parentDepartmentId) {
      console.log(
        `🔍 Looking for parent department: ${payload.parentDepartmentId}`
      );

      // Try to find parent in new structure first, or migrate if needed
      parentDept = await migrateDepartmentIfNeeded(
        payload.parentDepartmentId,
        orgId
      );

      if (!parentDept) {
        console.error(
          `❌ Parent department ${payload.parentDepartmentId} not found in organization ${orgId}`
        );
        throw new Error(
          `Parent department with ID "${payload.parentDepartmentId}" not found. Please ensure the parent department exists before creating a sub-department.`
        );
      }

      // Safety guard: ensure the parent belongs to this org
      if (parentDept.orgId !== orgId) {
        console.error(
          `❌ Parent department ${payload.parentDepartmentId} belongs to a different org (${parentDept.orgId})`
        );
        throw new Error(
          `Parent department belongs to a different organization. Please re-select a valid parent within this organization.`
        );
      }

      console.log(
        `✅ Found parent department: ${parentDept.name} (level: ${parentDept.level})`
      );
      level = parentDept.level + 1;
      path = `${parentDept.path}${parentDept.id}/`;
      ancestorIds = [...parentDept.ancestorIds, parentDept.id];
    }

    const now = Timestamp.now();
    const newDept: Omit<Department, "id"> = {
      name: payload.name,
      description: payload.description || "",
      orgId,
      memberIds: payload.memberIds || [],
      controllerUserIds: payload.controllerUserIds || [],
      // Ensure null instead of undefined for Firestore compatibility
      parentDepartmentId: parentDept ? parentDept.id : null,
      path,
      level,
      childDepartmentIds: [],
      hasChildren: false,
      ancestorIds,
      createdAt: now,
      updatedAt: now,
    };

    // Use batch for atomic operations
    const batch = writeBatch(db);

    // Create the new department
    const newDeptRef = doc(collection(db, "departments"));
    batch.set(newDeptRef, newDept);

    // Update parent department if exists
    if (parentDept) {
      const parentRef = doc(db, "departments", parentDept.id);
      batch.update(parentRef, {
        childDepartmentIds: [...parentDept.childDepartmentIds, newDeptRef.id],
        hasChildren: true,
        updatedAt: now,
      });
    }

    await batch.commit();
    console.log(
      `✅ Successfully created department: ${newDept.name} with ID: ${newDeptRef.id}`
    );

    // Now assign members using the unified function to ensure consistency
    if (payload.memberIds && payload.memberIds.length > 0) {
      await assignMembersToDepartment(newDeptRef.id, payload.memberIds, orgId);
    }

    return newDeptRef.id;
  } catch (error) {
    console.error("Error creating department:", error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes("Parent department")) {
        throw error; // Re-throw parent-specific errors as-is
      } else if (error.message.includes("FAILED_PRECONDITION")) {
        throw new Error(
          "Database index error. Please ensure all required Firestore indexes are created. Check the console for index creation links."
        );
      }
    }

    throw new Error("Failed to create department. Please try again.");
  }
}

// **4. UPDATING DEPARTMENTS**

/**
 * Update department basic info (name, description, etc.)
 */
export async function updateDepartment(
  departmentId: string,
  updates: Partial<
    Pick<Department, "name" | "description" | "memberIds" | "controllerUserIds">
  >
): Promise<void> {
  try {
    const departmentRef = doc(db, "departments", departmentId);
    await updateDoc(departmentRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("Error updating department:", error);
    throw new Error("Failed to update department");
  }
}

/**
 * Move department to new parent (complex operation)
 */
export async function moveDepartment(
  departmentId: string,
  newParentId?: string
): Promise<void> {
  try {
    const batch = writeBatch(db);

    // Fetch the department being moved
    const deptDoc = await getDoc(doc(db, "departments", departmentId));
    if (!deptDoc.exists()) {
      throw new Error("Department not found");
    }

    const dept = { id: deptDoc.id, ...deptDoc.data() } as Department;

    // Fetch all descendants to update their paths
    const descendants = await fetchDepartmentsByPath(dept.orgId, dept.path);

    let newLevel = 0;
    let newPath = "/";
    let newAncestorIds: string[] = [];

    // Calculate new parent info
    if (newParentId) {
      const newParentDoc = await getDoc(doc(db, "departments", newParentId));
      if (!newParentDoc.exists()) {
        throw new Error("New parent department not found");
      }

      const newParent = {
        id: newParentDoc.id,
        ...newParentDoc.data(),
      } as Department;
      newLevel = newParent.level + 1;
      newPath = `${newParent.path}${newParent.id}/`;
      newAncestorIds = [...newParent.ancestorIds, newParent.id];
    }

    // Update the moved department
    const departmentRef = doc(db, "departments", departmentId);
    batch.update(departmentRef, {
      parentDepartmentId: newParentId || null,
      level: newLevel,
      path: newPath,
      ancestorIds: newAncestorIds,
      updatedAt: Timestamp.now(),
    });

    // Update all descendants
    descendants.forEach((descendant) => {
      if (descendant.id !== departmentId) {
        const oldRelativePath = descendant.path.substring(dept.path.length);
        const updatedPath = `${newPath}${departmentId}/${oldRelativePath}`;
        const levelDiff = newLevel + 1 - dept.level;

        batch.update(doc(db, "departments", descendant.id), {
          path: updatedPath,
          level: descendant.level + levelDiff,
          ancestorIds: [
            ...newAncestorIds,
            departmentId,
            ...descendant.ancestorIds.slice(dept.ancestorIds.length + 1),
          ],
          updatedAt: Timestamp.now(),
        });
      }
    });

    // Update old parent's children list
    if (dept.parentDepartmentId) {
      const oldParentRef = doc(db, "departments", dept.parentDepartmentId);
      const oldParentDoc = await getDoc(oldParentRef);
      if (oldParentDoc.exists()) {
        const oldParent = oldParentDoc.data() as Department;
        const updatedChildren = oldParent.childDepartmentIds.filter(
          (id) => id !== departmentId
        );
        batch.update(oldParentRef, {
          childDepartmentIds: updatedChildren,
          hasChildren: updatedChildren.length > 0,
          updatedAt: Timestamp.now(),
        });
      }
    }

    // Update new parent's children list
    if (newParentId) {
      const newParentRef = doc(db, "departments", newParentId);
      const newParentDoc = await getDoc(newParentRef);
      if (newParentDoc.exists()) {
        const newParent = newParentDoc.data() as Department;
        batch.update(newParentRef, {
          childDepartmentIds: [...newParent.childDepartmentIds, departmentId],
          hasChildren: true,
          updatedAt: Timestamp.now(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    console.error("Error moving department:", error);
    throw new Error("Failed to move department");
  }
}

// **5. DELETING DEPARTMENTS**

/**
 * Delete department and handle children (move to parent or delete cascade)
 */
export async function deleteDepartment(
  departmentId: string,
  moveChildrenToParent: boolean = true
): Promise<void> {
  try {
    const batch = writeBatch(db);

    // Fetch the department to delete
    const deptDoc = await getDoc(doc(db, "departments", departmentId));
    if (!deptDoc.exists()) {
      throw new Error("Department not found");
    }

    const dept = { id: deptDoc.id, ...deptDoc.data() } as Department;

    // Handle children
    if (dept.hasChildren) {
      const children = await fetchChildDepartments(departmentId, dept.orgId);

      if (moveChildrenToParent) {
        // Move children to this department's parent
        for (const child of children) {
          // This is a simplified version - you might want to use moveDepartment for full path updates
          batch.update(doc(db, "departments", child.id), {
            parentDepartmentId: dept.parentDepartmentId || null,
            level: dept.parentDepartmentId ? dept.level : 0,
            updatedAt: Timestamp.now(),
          });
        }

        // Update parent's children list if exists
        if (dept.parentDepartmentId) {
          const parentDoc = await getDoc(
            doc(db, "departments", dept.parentDepartmentId)
          );
          if (parentDoc.exists()) {
            const parent = parentDoc.data() as Department;
            const updatedChildren = parent.childDepartmentIds
              .filter((id) => id !== departmentId)
              .concat(children.map((c) => c.id));

            batch.update(doc(db, "departments", dept.parentDepartmentId), {
              childDepartmentIds: updatedChildren,
              hasChildren: updatedChildren.length > 0,
              updatedAt: Timestamp.now(),
            });
          }
        }
      } else {
        // Cascade delete children
        for (const child of children) {
          await deleteDepartment(child.id, false); // Recursive delete
        }
      }
    }

    // Delete the department
    batch.delete(doc(db, "departments", departmentId));

    // Update parent's children list
    if (dept.parentDepartmentId) {
      const parentDoc = await getDoc(
        doc(db, "departments", dept.parentDepartmentId)
      );
      if (parentDoc.exists()) {
        const parent = parentDoc.data() as Department;
        const updatedChildren = parent.childDepartmentIds.filter(
          (id) => id !== departmentId
        );
        batch.update(doc(db, "departments", dept.parentDepartmentId), {
          childDepartmentIds: updatedChildren,
          hasChildren: updatedChildren.length > 0,
          updatedAt: Timestamp.now(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    console.error("Error deleting department:", error);
    throw new Error("Failed to delete department");
  }
}

// **6. UTILITY FUNCTIONS**

/**
 * Get department breadcrumb path
 */
export async function getDepartmentBreadcrumb(
  departmentId: string
): Promise<string> {
  try {
    const deptDoc = await getDoc(doc(db, "departments", departmentId));
    if (!deptDoc.exists()) {
      throw new Error("Department not found");
    }

    const dept = { id: deptDoc.id, ...deptDoc.data() } as Department;

    if (dept.ancestorIds.length === 0) {
      return dept.name; // Root department
    }

    // Fetch all ancestors
    const ancestorDocs = await Promise.all(
      dept.ancestorIds.map((id) => getDoc(doc(db, "departments", id)))
    );

    const ancestorNames = ancestorDocs
      .filter((doc) => doc.exists())
      .map((doc) => doc.data()!.name);

    return [...ancestorNames, dept.name].join(" > ");
  } catch (error) {
    console.error("Error getting department breadcrumb:", error);
    return "Unknown Department";
  }
}

/**
 * Check if user can access department (member or controller)
 */
export function canUserAccessDepartment(
  department: Department,
  userId: string
): boolean {
  return (
    department.memberIds.includes(userId) ||
    (department.controllerUserIds || []).includes(userId)
  );
}

/**
 * Check if user can manage department (controller or admin)
 */
export function canUserManageDepartment(
  department: Department,
  userId: string
): boolean {
  return (department.controllerUserIds || []).includes(userId);
}

// **NEW: User Management for Department Hierarchy**

/**
 * Fetch all members of an organization
 */
export async function fetchOrganizationMembers(
  orgId: string
): Promise<DisplayUser[]> {
  try {
    console.log(`🏢 Fetching organization members for orgId: ${orgId}`);

    const usersQuery = query(
      collection(db, "users"),
      where("organizationId", "==", orgId)
    );
    const usersSnap = await getDocs(usersQuery);

    console.log(`📊 Found ${usersSnap.docs.length} users in organization`);

    const members: DisplayUser[] = usersSnap.docs.map((doc) => {
      const userData = doc.data();
      const displayUser = {
        id: doc.id,
        name:
          userData.displayName ||
          userData.name ||
          `${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
          "Unknown User",
        email: userData.email,
        avatarUrl: userData.photoURL || userData.avatarUrl,
      };
      console.log(`👤 Org member: ${displayUser.name} (${displayUser.email})`);
      return displayUser;
    });

    console.log(`✅ Returning ${members.length} organization members`);
    return members;
  } catch (error) {
    console.error("❌ Error fetching organization members:", error);
    return [];
  }
}

/**
 * Get eligible members for a department (members of parent department or org if root)
 * SCALABLE VERSION: Uses Firestore array-contains query for better performance
 */
export async function getEligibleMembersForDepartment(
  orgId: string,
  parentDepartmentId?: string
): Promise<DisplayUser[]> {
  try {
    console.log(
      `🔍 Getting eligible members for orgId: ${orgId}, parentDepartmentId: ${parentDepartmentId}`
    );

    if (!parentDepartmentId) {
      // For root departments, return all org members
      console.log(`📋 Root department - fetching all org members`);
      return await fetchOrganizationMembers(orgId);
    }

    // Approach 1: Use orgMemberships-backed grouping with robust fallbacks (id → slug → legacy id)
    console.log(
      `🔄 Using UNIFIED fetchOrganizationMembersByDepartments for parent department: ${parentDepartmentId}`
    );
    const departmentMembersMap =
      await fetchOrganizationMembersByDepartments(orgId);

    let parentDeptMembers: AppUser[] =
      departmentMembersMap.get(parentDepartmentId) || [];

    if (!parentDeptMembers || parentDeptMembers.length === 0) {
      // Try to resolve by department name slug
      const deptDoc = await getDoc(doc(db, "departments", parentDepartmentId));
      let deptData: Department | null = null;
      if (deptDoc.exists()) {
        deptData = { id: deptDoc.id, ...(deptDoc.data() as any) } as Department;
        const nameSlug = (deptData.name || "")
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        if (nameSlug && departmentMembersMap.has(nameSlug)) {
          console.warn(
            `⚠️ No members under id=${parentDepartmentId}, using name slug fallback: ${nameSlug}`
          );
          parentDeptMembers = departmentMembersMap.get(nameSlug) || [];
        }
      }

      // Try legacy organization.customDepartments id with same name
      if ((!parentDeptMembers || parentDeptMembers.length === 0) && deptData) {
        const orgSnap = await getDoc(doc(db, "organizations", orgId));
        if (orgSnap.exists()) {
          const orgData = orgSnap.data() as any;
          const legacyMatch = (orgData.customDepartments || []).find(
            (cd: any) =>
              cd?.name?.toLowerCase().trim() ===
              (deptData as any).name?.toLowerCase().trim()
          );
          if (legacyMatch && departmentMembersMap.has(legacyMatch.id)) {
            console.warn(
              `⚠️ Falling back to legacy customDepartments id: ${legacyMatch.id}`
            );
            parentDeptMembers = departmentMembersMap.get(legacyMatch.id) || [];
          }
        }
      }
    }

    // Approach 2: Fallback to scanning users' departmentalRoles directly
    if (!parentDeptMembers || parentDeptMembers.length === 0) {
      console.log(
        `⚠️ No members found via orgMemberships map, trying departmentalRoles scan...`
      );
      parentDeptMembers = await fetchDepartmentMembersUnified(
        parentDepartmentId,
        orgId
      );
    }

    // Approach 3: Final fallback to legacy department.memberIds field
    if (!parentDeptMembers || parentDeptMembers.length === 0) {
      console.log(
        `⚠️ No members found via unified scan, trying legacy memberIds fallback...`
      );
      const deptDoc = await getDoc(doc(db, "departments", parentDepartmentId));
      if (deptDoc.exists()) {
        const deptData = deptDoc.data() as Department;
        const memberIds = deptData.memberIds || [];
        console.log(
          `📋 Found ${memberIds.length} memberIds in department document`
        );
        if (memberIds.length > 0) {
          const usersQuery = query(
            collection(db, "users"),
            where("uid", "in", memberIds),
            where("organizationId", "==", orgId)
          );
          const usersSnap = await getDocs(usersQuery);
          parentDeptMembers = usersSnap.docs.map(
            (doc) => ({ uid: doc.id, ...doc.data() }) as AppUser
          );
          console.log(
            `✅ Found ${parentDeptMembers.length} members via legacy memberIds fallback`
          );
        }
      }
    }

    console.log(`✅ Total members found: ${parentDeptMembers.length}`);

    if (parentDeptMembers.length === 0) {
      console.warn(
        `❌ Parent department "${parentDepartmentId}" has no members assigned`
      );
      throw new Error(
        `Cannot create sub-department: The parent department has no members assigned.\n\nTo fix this:\n1. Go to Organization → Departments\n2. Assign users to the parent department\n3. Then return here to create sub-departments`
      );
    }

    // Convert to DisplayUser format
    const displayUsers: DisplayUser[] = parentDeptMembers.map((user: any) => ({
      id: user.uid,
      name:
        user.displayName ||
        user.name ||
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        "Unknown User",
      email: user.email,
      avatarUrl: user.photoURL || user.avatarUrl,
    }));

    console.log(`✅ Returning ${displayUsers.length} eligible members`);
    return displayUsers;
  } catch (error) {
    console.error("❌ Error getting eligible members:", error);
    throw error;
  }
}

/**
 * Get a department by ID
 */
export async function getDepartmentById(
  departmentId: string
): Promise<Department | null> {
  try {
    const deptDoc = await getDoc(doc(db, "departments", departmentId));
    if (deptDoc.exists()) {
      return { id: deptDoc.id, ...deptDoc.data() } as Department;
    }
    return null;
  } catch (error) {
    console.error("Error fetching department:", error);
    return null;
  }
}

/**
 * UNIFIED MEMBER ASSIGNMENT FUNCTIONS
 * These functions ensure that department membership is always consistent between:
 * 1. department.memberIds (for denormalization/caching)
 * 2. user.orgRoles[].departmentalRoles[] (single source of truth)
 */

/**
 * Unified function to assign members to a department.
 * Updates both department.memberIds AND user.orgRoles[].departmentalRoles[] for consistency.
 * This ensures scalable, consistent member fetching from a single source of truth.
 */
export async function assignMembersToDepartment(
  departmentId: string,
  memberIds: string[],
  orgId: string
): Promise<void> {
  try {
    console.log(
      `🔄 Assigning ${memberIds.length} members to department ${departmentId}`
    );

    const batch = writeBatch(db);
    const now = Timestamp.now();

    // 1. Update the department's memberIds (for denormalization/caching)
    const deptRef = doc(db, "departments", departmentId);
    batch.update(deptRef, {
      memberIds,
      updatedAt: now,
    });

    // 2. Update each user's departmentalRoles (source of truth)
    for (const userId of memberIds) {
      const userRef = doc(db, "users", userId);

      // First, get current user data to update their orgRoles properly
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data() as AppUser;
        const currentOrgRoles = userData.orgRoles || [];

        // Find or create the org role entry
        let orgRoleIndex = currentOrgRoles.findIndex((r) => r.orgId === orgId);
        let updatedOrgRoles = [...currentOrgRoles];

        if (orgRoleIndex === -1) {
          // Create new org role entry
          updatedOrgRoles.push({
            orgId,
            orgRole: "member" as any, // Default role
            departmentalRoles: [departmentId],
          });
        } else {
          // Update existing org role entry
          const currentDeptRoles =
            updatedOrgRoles[orgRoleIndex].departmentalRoles || [];
          if (!currentDeptRoles.includes(departmentId)) {
            updatedOrgRoles[orgRoleIndex] = {
              ...updatedOrgRoles[orgRoleIndex],
              departmentalRoles: [...currentDeptRoles, departmentId],
            };
          }
        }

        batch.update(userRef, {
          orgRoles: updatedOrgRoles,
          updatedAt: now,
        });
      }
    }

    await batch.commit();
    console.log(
      `✅ Successfully assigned members to department ${departmentId}`
    );
  } catch (error) {
    console.error("Error assigning members to department:", error);
    throw new Error("Failed to assign members to department");
  }
}

/**
 * Unified function to remove members from a department.
 * Updates both department.memberIds AND user.orgRoles[].departmentalRoles[] for consistency.
 */
export async function removeMembersFromDepartment(
  departmentId: string,
  memberIds: string[],
  orgId: string
): Promise<void> {
  try {
    console.log(
      `🔄 Removing ${memberIds.length} members from department ${departmentId}`
    );

    const batch = writeBatch(db);
    const now = Timestamp.now();

    // 1. Update the department's memberIds
    const deptRef = doc(db, "departments", departmentId);
    const deptSnap = await getDoc(deptRef);
    if (deptSnap.exists()) {
      const currentMemberIds = (deptSnap.data() as Department).memberIds || [];
      const updatedMemberIds = currentMemberIds.filter(
        (id) => !memberIds.includes(id)
      );

      batch.update(deptRef, {
        memberIds: updatedMemberIds,
        updatedAt: now,
      });
    }

    // 2. Update each user's departmentalRoles
    for (const userId of memberIds) {
      const userRef = doc(db, "users", userId);

      // Get current user data to update their orgRoles properly
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data() as AppUser;
        const currentOrgRoles = userData.orgRoles || [];

        // Find the org role entry
        const orgRoleIndex = currentOrgRoles.findIndex(
          (r) => r.orgId === orgId
        );
        if (orgRoleIndex !== -1) {
          const currentDeptRoles =
            currentOrgRoles[orgRoleIndex].departmentalRoles || [];
          const updatedDeptRoles = currentDeptRoles.filter(
            (id) => id !== departmentId
          );

          const updatedOrgRoles = [...currentOrgRoles];
          updatedOrgRoles[orgRoleIndex] = {
            ...updatedOrgRoles[orgRoleIndex],
            departmentalRoles: updatedDeptRoles,
          };

          batch.update(userRef, {
            orgRoles: updatedOrgRoles,
            updatedAt: now,
          });
        }
      }
    }

    await batch.commit();
    console.log(
      `✅ Successfully removed members from department ${departmentId}`
    );
  } catch (error) {
    console.error("Error removing members from department:", error);
    throw new Error("Failed to remove members from department");
  }
}

/**
 * Unified function to fetch department members using departmentalRoles as the single source of truth.
 * This ensures consistent, scalable member fetching across the entire system.
 */
export async function fetchDepartmentMembersUnified(
  departmentId: string,
  orgId: string
): Promise<AppUser[]> {
  try {
    console.log(
      `🔍 Fetching members for department ${departmentId} using departmentalRoles`
    );

    // Query users who have this departmentId in their departmentalRoles
    const usersQuery = query(
      collection(db, "users"),
      where("organizationId", "==", orgId)
      // TODO: Add composite index for orgId + orgRoles.departmentalRoles for better performance
    );

    const usersSnap = await getDocs(usersQuery);
    const members: AppUser[] = [];

    usersSnap.docs.forEach((userDoc) => {
      const userData = userDoc.data() as AppUser;
      const userOrgRole = userData.orgRoles?.find((r) => r.orgId === orgId);

      // Check if this user has the departmentId in their departmentalRoles
      if (userOrgRole?.departmentalRoles?.includes(departmentId)) {
        members.push({
          ...userData,
          uid: userDoc.id, // Ensure uid is set to the document ID
        });
      }
    });

    console.log(
      `👥 Found ${members.length} members for department ${departmentId}`
    );
    return members;
  } catch (error) {
    console.error("Error fetching department members:", error);
    throw new Error("Failed to fetch department members");
  }
}

/**
 * Unified function to fetch members for multiple departments at once.
 * This is more efficient than calling fetchDepartmentMembersUnified multiple times.
 * Returns a map of departmentId -> AppUser[]
 */
export async function fetchMultipleDepartmentMembers(
  departmentIds: string[],
  orgId: string
): Promise<Map<string, AppUser[]>> {
  try {
    console.log(
      `🔍 Fetching members for ${departmentIds.length} departments using unified approach`
    );

    const departmentMembersMap = new Map<string, AppUser[]>();

    // Initialize empty arrays for all departments
    departmentIds.forEach((deptId) => {
      departmentMembersMap.set(deptId, []);
    });

    // Query users who have any of these departmentIds in their departmentalRoles
    const usersQuery = query(
      collection(db, "users"),
      where("organizationId", "==", orgId)
      // TODO: Add composite index for orgId + orgRoles.departmentalRoles for better performance
    );

    const usersSnap = await getDocs(usersQuery);

    usersSnap.docs.forEach((userDoc) => {
      const userData = userDoc.data() as AppUser;
      const userOrgRole = userData.orgRoles?.find((r) => r.orgId === orgId);

      if (userOrgRole?.departmentalRoles) {
        // Check which departments this user belongs to
        userOrgRole.departmentalRoles.forEach((deptRole: any) => {
          const deptId =
            typeof deptRole === "string" ? deptRole : deptRole.departmentId;

          // If this department is in our requested list, add the user
          if (departmentIds.includes(deptId)) {
            const currentMembers = departmentMembersMap.get(deptId) || [];
            currentMembers.push({
              ...userData,
              uid: userDoc.id,
            });
            departmentMembersMap.set(deptId, currentMembers);
          }
        });
      }
    });

    console.log(
      `✅ Successfully fetched members for ${departmentIds.length} departments`
    );
    return departmentMembersMap;
  } catch (error) {
    console.error("Error fetching members for multiple departments:", error);
    throw new Error("Failed to fetch department members");
  }
}

/**
 * Unified function to group all organization users by their departments.
 * This replaces the inline grouping logic in teams/page.tsx
 */
export async function fetchOrganizationMembersByDepartments(
  orgId: string
): Promise<Map<string, AppUser[]>> {
  try {
    console.log(`🔍 Fetching org memberships for grouping (orgId=${orgId})`);
    // Dynamic import to avoid circular deps if any
    const { listOrgMemberships } = await import("./memberships");
    const memberships = await listOrgMemberships(orgId);
    const departmentMembersMap = new Map<string, AppUser[]>();
    if (memberships.length) {
      memberships.forEach((m) => {
        const roleVal =
          (m as any).orgRole?.orgRole ||
          (m as any).orgRole ||
          (m as any).orgRole?.role;
        // Derive deptIds if empty from orgRole.departmentalRoles
        const derivedDeptIds: string[] =
          Array.isArray((m as any).departmentIds) &&
          (m as any).departmentIds.length
            ? (m as any).departmentIds
            : (m as any).orgRole?.departmentalRoles || [];
        const deptIdsClean = (derivedDeptIds || []).filter(Boolean);
        if (!deptIdsClean.length) {
          const key = "unassigned-department";
          if (!departmentMembersMap.has(key)) departmentMembersMap.set(key, []);
          departmentMembersMap.get(key)!.push({
            uid: m.userId,
            displayName: m.displayName,
            photoURL: m.photoURL || undefined,
            email: (m as any).email || null,
            orgRoles: [
              {
                orgId: m.orgId,
                orgRole: roleVal,
                departmentalRoles: [],
              } as any,
            ],
          } as AppUser);
        } else {
          deptIdsClean.forEach((deptId) => {
            if (!departmentMembersMap.has(deptId))
              departmentMembersMap.set(deptId, []);
            departmentMembersMap.get(deptId)!.push({
              uid: m.userId,
              displayName: m.displayName,
              photoURL: m.photoURL || undefined,
              email: (m as any).email || null,
              orgRoles: [
                {
                  orgId: m.orgId,
                  orgRole: roleVal,
                  departmentalRoles: deptIdsClean,
                } as any,
              ],
            } as AppUser);
          });
        }
      });
      // De-duplicate: remove users from unassigned if they appear in any real department
      const assignedIds = new Set<string>();
      departmentMembersMap.forEach((members, deptId) => {
        if (deptId === "unassigned-department") return;
        members.forEach((m) => assignedIds.add((m as any).uid));
      });
      if (departmentMembersMap.has("unassigned-department")) {
        const filtered = departmentMembersMap
          .get("unassigned-department")!
          .filter((m) => !assignedIds.has((m as any).uid));
        if (filtered.length) {
          departmentMembersMap.set("unassigned-department", filtered);
        } else {
          departmentMembersMap.delete("unassigned-department");
        }
      }
      console.log(
        `✅ Grouped ${memberships.length} memberships into ${departmentMembersMap.size} buckets.`
      );
      return departmentMembersMap;
    }
    console.warn(
      `⚠️ No orgMemberships found for org ${orgId}. Returning empty grouping. Ensure membership upsert runs on org creation/join & role edits.`
    );
    return departmentMembersMap; // empty
  } catch (error) {
    console.error("Error fetching organization members by departments:", error);
    throw new Error("Failed to fetch organization members by departments");
  }
}

/**
 * Fetch all users belonging to an organization (by active organizationId, orgIds array, or orgRoles membership).
 * Returns lightweight user objects (id, displayName, photoURL, email).
 * Centralizes multi-field fallback logic to avoid silent omissions when a user's active organizationId changes.
 */
export async function getUsersInOrganization(
  orgId: string
): Promise<AppUser[]> {
  try {
    // 1. Primary: orgIds array membership
    let snap = await getDocs(
      query(collection(db, "users"), where("orgIds", "array-contains", orgId))
    );
    // 2. Fallback: legacy active organizationId
    if (snap.empty) {
      snap = await getDocs(
        query(collection(db, "users"), where("organizationId", "==", orgId))
      );
    }
    // 3. Collect candidates and re-filter via orgRoles (covers users whose active organizationId is different now)
    const candidates = snap.docs.map((d) => ({
      uid: d.id,
      ...(d.data() as any),
    })) as any[];
    const enriched: AppUser[] = [];
    for (const c of candidates) {
      const inOrgViaRoles = !!c.orgRoles?.some((r: any) => r.orgId === orgId);
      const activeMatch = c.organizationId === orgId;
      const inOrgViaArray = Array.isArray(c.orgIds) && c.orgIds.includes(orgId);
      if (inOrgViaRoles || activeMatch || inOrgViaArray) {
        enriched.push({ ...(c as AppUser), uid: c.uid });
      }
    }
    // 4. If we still might have missed users whose active org changed but have roles, run a lightweight secondary scan (guarded)
    if (enriched.length === 0) {
      // Last resort: broad scan (could be expensive) - skipped here for cost reasons
    }
    return enriched;
  } catch (e) {
    console.error("getUsersInOrganization failed", e);
    return [];
  }
}

/**
 * CONTEXT DETECTION UTILITIES
 * Determines assignment scope and context for projects and tasks
 */

/**
 * Detects if a department is a sub-department and returns context information
 */
export function getDepartmentAssignmentContext(department: Department | null) {
  const isSubDepartment = department?.parentDepartmentId != null;
  const isMainDepartment = !isSubDepartment;

  return {
    isSubDepartment,
    isMainDepartment,
    assignmentScope: isSubDepartment
      ? "department-members"
      : "organization-wide",
    contextType: isSubDepartment ? "sub-department" : "main-department",
  } as const;
}

/**
 * Validates that assigned user IDs are appropriate for the department context
 */
export function validateAssignmentScope(
  assignedUserIds: string[],
  department: Department | null,
  departmentMembers: (DisplayUser | AppUser)[],
  allOrgUsers?: (DisplayUser | AppUser)[]
): { isValid: boolean; invalidUsers: string[]; errorMessage?: string } {
  const context = getDepartmentAssignmentContext(department);

  if (context.isSubDepartment) {
    const departmentMemberIds = departmentMembers.map((member) =>
      "uid" in member ? member.uid : member.id
    );
    const invalidUserIds = assignedUserIds.filter(
      (userId) => !departmentMemberIds.includes(userId)
    );

    if (invalidUserIds.length > 0) {
      const invalidUserNames = invalidUserIds.map((userId) => {
        const user = allOrgUsers?.find(
          (u) => ("uid" in u ? u.uid : u.id) === userId
        );
        if (user && "displayName" in user && user.displayName) {
          return user.displayName;
        }
        if (user && "name" in user && user.name) {
          return user.name;
        }
        return user?.email || userId;
      });

      return {
        isValid: false,
        invalidUsers: invalidUserIds,
        errorMessage: `Cannot assign users outside this sub-department: ${invalidUserNames.join(
          ", "
        )}. Please select only members from this department.`,
      };
    }
  }

  return { isValid: true, invalidUsers: [] };
}

/**
 * Filters available users based on department context
 */
export function getContextAwareUserList<T extends DisplayUser | AppUser>(
  department: Department | null,
  departmentMembers: T[],
  allOrgUsers: T[]
): T[] {
  const context = getDepartmentAssignmentContext(department);

  return context.isSubDepartment ? departmentMembers : allOrgUsers;
}
