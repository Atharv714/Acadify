import {
  collection,
  doc,
  getDocs,
  query,
  where,
  updateDoc,
  addDoc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { Organization, Department } from "./types";

/**
 * MIGRATION SCRIPT: Move from nested departments to separate collection
 *
 * This script helps migrate existing organizations that have departments
 * stored as nested arrays (customDepartments) to the new structure where
 * departments are stored in a separate "departments" collection.
 */

interface LegacyDepartment {
  id: string;
  name: string;
  description?: string;
  memberIds: string[];
  controllerUserIds?: string[];
  createdAt?: Date | Timestamp;
  updatedAt?: Date | Timestamp;
}

/**
 * Migrate a single organization's departments
 */
export async function migrateOrganizationDepartments(
  orgId: string
): Promise<void> {
  try {
    console.log(`🔄 Starting migration for organization: ${orgId}`);

    // Fetch the organization
    const orgDoc = await getDocs(
      query(collection(db, "organizations"), where("__name__", "==", orgId))
    );

    if (orgDoc.empty) {
      throw new Error(`Organization ${orgId} not found`);
    }

    const orgData = orgDoc.docs[0].data() as Organization;
    const legacyDepartments =
      ((orgData as any).customDepartments as LegacyDepartment[]) || [];

    if (legacyDepartments.length === 0) {
      console.log(`✅ No departments to migrate for organization: ${orgId}`);
      return;
    }

    const batch = writeBatch(db);
    const now = Timestamp.now();
    const rootDepartmentIds: string[] = [];

    // Create new department documents
    for (const legacyDept of legacyDepartments) {
      const newDeptRef = doc(collection(db, "departments"));
      const newDepartment: Omit<Department, "id"> = {
        name: legacyDept.name,
        description: legacyDept.description || "",
        orgId: orgId,
        memberIds: legacyDept.memberIds || [],
        controllerUserIds: legacyDept.controllerUserIds || [],

        // New nested structure fields - all legacy depts become root level
        parentDepartmentId: undefined,
        path: "/",
        level: 0,
        childDepartmentIds: [],
        hasChildren: false,
        ancestorIds: [],

        createdAt: legacyDept.createdAt || now,
        updatedAt: legacyDept.updatedAt || now,
      };

      batch.set(newDeptRef, newDepartment);
      rootDepartmentIds.push(newDeptRef.id);

      console.log(
        `📁 Migrating department: ${legacyDept.name} -> ${newDeptRef.id}`
      );
    }

    // Update organization document
    const orgRef = doc(db, "organizations", orgId);
    batch.update(orgRef, {
      rootDepartmentIds,
      // Remove the old customDepartments field
      customDepartments: null,
    });

    // Commit the batch
    await batch.commit();

    console.log(
      `✅ Successfully migrated ${legacyDepartments.length} departments for organization: ${orgId}`
    );
    console.log(`🏠 Root department IDs: ${rootDepartmentIds.join(", ")}`);
  } catch (error) {
    console.error(`❌ Error migrating organization ${orgId}:`, error);
    throw error;
  }
}

/**
 * Migrate all organizations in the database
 */
export async function migrateAllOrganizations(): Promise<void> {
  try {
    console.log("🚀 Starting migration for all organizations...");

    // Fetch all organizations
    const orgsSnapshot = await getDocs(collection(db, "organizations"));
    const totalOrgs = orgsSnapshot.docs.length;

    console.log(`📊 Found ${totalOrgs} organizations to check`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const orgDoc of orgsSnapshot.docs) {
      try {
        const orgData = orgDoc.data() as Organization;
        const hasLegacyDepartments =
          (orgData as any).customDepartments?.length > 0;

        if (hasLegacyDepartments) {
          await migrateOrganizationDepartments(orgDoc.id);
          migratedCount++;
        } else {
          console.log(
            `⏭️  Skipping organization ${orgDoc.id} (no legacy departments)`
          );
          skippedCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to migrate organization ${orgDoc.id}:`, error);
        errorCount++;
      }
    }

    console.log("\n📈 Migration Summary:");
    console.log(`✅ Successfully migrated: ${migratedCount} organizations`);
    console.log(`⏭️  Skipped (no legacy data): ${skippedCount} organizations`);
    console.log(`❌ Failed: ${errorCount} organizations`);
    console.log(`📊 Total processed: ${totalOrgs} organizations`);

    if (errorCount > 0) {
      console.warn(
        "⚠️  Some organizations failed to migrate. Check the logs above for details."
      );
    }
  } catch (error) {
    console.error("❌ Fatal error during migration:", error);
    throw error;
  }
}

/**
 * Dry run migration - shows what would be migrated without making changes
 */
export async function dryRunMigration(): Promise<void> {
  try {
    console.log("🔍 Dry run: Analyzing organizations for migration...");

    const orgsSnapshot = await getDocs(collection(db, "organizations"));
    const totalOrgs = orgsSnapshot.docs.length;

    console.log(`📊 Found ${totalOrgs} organizations`);

    let needsMigration = 0;
    let alreadyMigrated = 0;
    let totalDepartments = 0;

    for (const orgDoc of orgsSnapshot.docs) {
      const orgData = orgDoc.data() as Organization;
      const legacyDepartments =
        ((orgData as any).customDepartments as LegacyDepartment[]) || [];
      const hasRootDepartmentIds = orgData.rootDepartmentIds?.length > 0;

      if (legacyDepartments.length > 0) {
        console.log(
          `📁 ${orgDoc.id}: ${legacyDepartments.length} legacy departments (NEEDS MIGRATION)`
        );
        needsMigration++;
        totalDepartments += legacyDepartments.length;
      } else if (hasRootDepartmentIds) {
        console.log(
          `✅ ${orgDoc.id}: Already migrated (${orgData.rootDepartmentIds!.length} root departments)`
        );
        alreadyMigrated++;
      } else {
        console.log(`🈳 ${orgDoc.id}: No departments`);
      }
    }

    console.log("\n📈 Dry Run Summary:");
    console.log(`🔄 Organizations needing migration: ${needsMigration}`);
    console.log(`📁 Total departments to migrate: ${totalDepartments}`);
    console.log(`✅ Organizations already migrated: ${alreadyMigrated}`);
    console.log(`📊 Total organizations: ${totalOrgs}`);
  } catch (error) {
    console.error("❌ Error during dry run:", error);
    throw error;
  }
}

/**
 * Rollback migration - move departments back to nested structure
 * WARNING: This will delete the separate department documents!
 */
export async function rollbackMigration(orgId: string): Promise<void> {
  try {
    console.log(`⏪ Rolling back migration for organization: ${orgId}`);

    // Fetch all departments for this organization
    const deptSnapshot = await getDocs(
      query(
        collection(db, "departments"),
        where("orgId", "==", orgId),
        where("level", "==", 0) // Only root level for rollback
      )
    );

    if (deptSnapshot.empty) {
      console.log(`✅ No departments to rollback for organization: ${orgId}`);
      return;
    }

    const batch = writeBatch(db);
    const legacyDepartments: LegacyDepartment[] = [];

    // Convert back to legacy format
    deptSnapshot.docs.forEach((deptDoc) => {
      const dept = { id: deptDoc.id, ...deptDoc.data() } as Department;

      legacyDepartments.push({
        id: dept.id,
        name: dept.name,
        description: dept.description,
        memberIds: dept.memberIds,
        controllerUserIds: dept.controllerUserIds,
        createdAt: dept.createdAt,
        updatedAt: dept.updatedAt,
      });

      // Delete the department document
      batch.delete(doc(db, "departments", dept.id));
    });

    // Update organization document
    const orgRef = doc(db, "organizations", orgId);
    batch.update(orgRef, {
      customDepartments: legacyDepartments,
      rootDepartmentIds: null,
    });

    await batch.commit();

    console.log(
      `✅ Successfully rolled back ${legacyDepartments.length} departments for organization: ${orgId}`
    );
  } catch (error) {
    console.error(`❌ Error rolling back organization ${orgId}:`, error);
    throw error;
  }
}

// Usage examples:
/*
// Dry run to see what needs migration
await dryRunMigration();

// Migrate a specific organization
await migrateOrganizationDepartments("your-org-id");

// Migrate all organizations
await migrateAllOrganizations();

// Rollback a specific organization (if needed)
await rollbackMigration("your-org-id");
*/
