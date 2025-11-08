import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

interface Organization {
  id: string;
  name?: string;
  memberUserIds?: string[];
  customDepartments?: any[];
  [key: string]: any;
}

interface AppUser {
  id: string;
  uid?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  displayName?: string;
  [key: string]: any;
}

interface ApiResponse {
  organization: Organization;
  members: AppUser[];
  departments: any[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  try {
    const orgId = params?.orgId;

    if (!orgId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    // Get and verify Firebase ID token
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];

    // Verify the token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Get organization document
    const orgDocRef = adminDb.collection("organizations").doc(orgId);
    const orgDoc = await orgDocRef.get();

    if (!orgDoc.exists) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const orgData = { id: orgDoc.id, ...orgDoc.data() } as Organization;

    // Check if user is a member of this organization
    if (!orgData.memberUserIds?.includes(userId)) {
      return NextResponse.json(
        { error: "Access denied: Not a member of this organization" },
        { status: 403 }
      );
    }

    // Get member details
    let members: AppUser[] = [];

    if (orgData.memberUserIds && orgData.memberUserIds.length > 0) {
      // Batch fetch user documents (limit to 30 for Firestore 'in' query limit)
      const batchSize = 30;
      const memberIds = orgData.memberUserIds.slice(0, batchSize);

      const memberDocs = await Promise.all(
        memberIds.map((uid) => adminDb.collection("users").doc(uid).get())
      );

      members = memberDocs
        .filter((doc) => doc.exists)
        .map(
          (doc) =>
            ({
              id: doc.id,
              uid: doc.id,
              ...doc.data(),
            }) as AppUser
        );
    }

    const response: ApiResponse = {
      organization: orgData,
      members,
      departments: orgData.customDepartments || [],
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
