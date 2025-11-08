import { NextResponse } from "next/server";
import { Resend } from "resend";
import InvitationEmail from "@/emails/invitation-email";
import InvitationEmailText from "@/emails/invitation-email-text";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";

const resend = new Resend(process.env.RESEND_API_KEY);

// Rate limiting constants
const RATE_LIMITS = {
  ORGANIZATION: { MAX_EMAILS: 25, WINDOW_HOURS: 24 },
  USER: { MAX_EMAILS: 10, WINDOW_MINUTES: 60 },
  IP: { MAX_EMAILS: 50, WINDOW_HOURS: 24 },
  BATCH: { MAX_EMAILS: 10 },
} as const;

// Helper function to verify user authentication and organization membership
async function verifyUserAndOrganization(
  request: Request,
  organizationId: string
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { error: "No valid authorization header", status: 401 };
    }

    const userId = request.headers.get("x-user-id");
    if (!userId) {
      return { error: "User ID not provided", status: 401 };
    }

    // Check if user exists
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return { error: "User not found", status: 404 };
    }

    const userData = userDoc.data();

    // Check if user belongs to the organization
    if (
      !userData.organizations ||
      !userData.organizations.includes(organizationId)
    ) {
      return {
        error: "User not authorized for this organization",
        status: 403,
      };
    }

    // Check if user has permission to send invites (admin or owner role)
    const memberRef = doc(
      db,
      "organizations",
      organizationId,
      "members",
      userId
    );
    const memberDoc = await getDoc(memberRef);

    if (!memberDoc.exists()) {
      return {
        error: "User membership not found in organization",
        status: 403,
      };
    }

    const memberData = memberDoc.data();
    const allowedRoles = ["admin", "owner"];

    if (!allowedRoles.includes(memberData.role)) {
      return {
        error: "Insufficient permissions to send invitations",
        status: 403,
      };
    }

    return { userId, userRole: memberData.role };
  } catch (error) {
    console.error("Error verifying user and organization:", error);
    return { error: "Authentication verification failed", status: 500 };
  }
}

// Rate limiting functions
async function checkOrganizationRateLimit(
  organizationId: string,
  emailCount: number
) {
  const now = new Date();
  const rateLimitDocId = `${organizationId}-${now.toISOString().split("T")[0]}`;
  const rateLimitRef = doc(db, "rateLimits", rateLimitDocId);

  try {
    const rateLimitDoc = await getDoc(rateLimitRef);
    const currentCount = rateLimitDoc.exists()
      ? rateLimitDoc.data()?.count || 0
      : 0;

    if (currentCount + emailCount > RATE_LIMITS.ORGANIZATION.MAX_EMAILS) {
      return {
        exceeded: true,
        currentCount,
        limit: RATE_LIMITS.ORGANIZATION.MAX_EMAILS,
      };
    }

    return { exceeded: false, rateLimitRef, rateLimitDoc, currentCount };
  } catch (error) {
    console.error("Error checking organization rate limit:", error);
    return { exceeded: false };
  }
}

async function checkUserRateLimit(userId: string, emailCount: number) {
  const now = new Date();
  const hourStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours()
  );
  const rateLimitDocId = `user-${userId}-${hourStart.toISOString()}`;
  const rateLimitRef = doc(db, "userRateLimits", rateLimitDocId);

  try {
    const rateLimitDoc = await getDoc(rateLimitRef);
    const currentCount = rateLimitDoc.exists()
      ? rateLimitDoc.data()?.count || 0
      : 0;

    if (currentCount + emailCount > RATE_LIMITS.USER.MAX_EMAILS) {
      return {
        exceeded: true,
        currentCount,
        limit: RATE_LIMITS.USER.MAX_EMAILS,
      };
    }

    return { exceeded: false, rateLimitRef, rateLimitDoc, currentCount };
  } catch (error) {
    console.error("Error checking user rate limit:", error);
    return { exceeded: false };
  }
}

async function checkIPRateLimit(request: Request, emailCount: number) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0] || realIP || "unknown";

  if (ip === "unknown") {
    return { exceeded: false };
  }

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rateLimitDocId = `ip-${ip.replace(/\./g, "-")}-${dayStart.toISOString().split("T")[0]}`;
  const rateLimitRef = doc(db, "ipRateLimits", rateLimitDocId);

  try {
    const rateLimitDoc = await getDoc(rateLimitRef);
    const currentCount = rateLimitDoc.exists()
      ? rateLimitDoc.data()?.count || 0
      : 0;

    if (currentCount + emailCount > RATE_LIMITS.IP.MAX_EMAILS) {
      return {
        exceeded: true,
        currentCount,
        limit: RATE_LIMITS.IP.MAX_EMAILS,
        ip,
      };
    }

    return { exceeded: false, rateLimitRef, rateLimitDoc, currentCount, ip };
  } catch (error) {
    console.error("Error checking IP rate limit:", error);
    return { exceeded: false };
  }
}

export async function POST(request: Request) {
  try {
    const {
      emails,
      organizationId,
      organizationName,
      inviterName,
      customMessage,
    } = await request.json();

    // Verify user authentication and organization membership
    const authResult = await verifyUserAndOrganization(request, organizationId);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { userId, userRole } = authResult as {
      userId: string;
      userRole: string;
    };

    // Basic validation
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "Email list is required" },
        { status: 400 }
      );
    }

    if (emails.length > RATE_LIMITS.BATCH.MAX_EMAILS) {
      return NextResponse.json(
        {
          error: `Cannot send more than ${RATE_LIMITS.BATCH.MAX_EMAILS} invitations at once`,
        },
        { status: 400 }
      );
    }

    if (!organizationName || !organizationId) {
      return NextResponse.json(
        { error: "Organization details required" },
        { status: 400 }
      );
    }

    // Check all rate limits
    const [orgRateLimit, userRateLimit, ipRateLimit] = await Promise.all([
      checkOrganizationRateLimit(organizationId, emails.length),
      checkUserRateLimit(userId, emails.length),
      checkIPRateLimit(request, emails.length),
    ]);

    if (orgRateLimit.exceeded) {
      return NextResponse.json(
        {
          error: `Organization rate limit exceeded. Maximum ${orgRateLimit.limit} invitations per day. Current: ${orgRateLimit.currentCount}/${orgRateLimit.limit}`,
        },
        { status: 429 }
      );
    }

    if (userRateLimit.exceeded) {
      return NextResponse.json(
        {
          error: `Personal rate limit exceeded. Maximum ${userRateLimit.limit} invitations per hour. Current: ${userRateLimit.currentCount}/${userRateLimit.limit}`,
        },
        { status: 429 }
      );
    }

    if (ipRateLimit.exceeded) {
      return NextResponse.json(
        {
          error: `IP rate limit exceeded. Maximum ${ipRateLimit.limit} invitations per day. Current: ${ipRateLimit.currentCount}/${ipRateLimit.limit}`,
        },
        { status: 429 }
      );
    }

    // Get organization details
    const orgRef = doc(db, "organizations", organizationId);
    const orgDoc = await getDoc(orgRef);

    if (!orgDoc.exists()) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const orgData = orgDoc.data();
    const inviteCode = orgData.inviteCode;

    if (!inviteCode) {
      return NextResponse.json(
        { error: "Organization invite code not found" },
        { status: 500 }
      );
    }

    // Validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(
      (email: string) => !emailRegex.test(email)
    );
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid email format: ${invalidEmails.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Send emails
    const results = [];
    for (const email of emails) {
      const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/join-organization?code=${inviteCode}&email=${encodeURIComponent(email)}`;

      try {
        const data = await resend.emails.send({
          from: `Magnifi <invitations@magnifi.space>`,
          to: email,
          subject: `Invitation to join ${organizationName}`,
          react: InvitationEmail({
            organizationName,
            inviterName,
            inviteLink,
            customMessage,
            invitedUserEmail: email,
            organizationLogo: `${process.env.NEXT_PUBLIC_APP_URL}/magnifi-m.png`,
            joiningCode: inviteCode,
          }),
          text: InvitationEmailText({
            organizationName,
            inviterName,
            inviteLink,
            customMessage,
            invitedUserEmail: email,
            joiningCode: inviteCode,
          }),
        });

        if (data.error) {
          results.push({ email, success: false, error: data.error.message });
        } else {
          results.push({ email, success: true, emailId: data.data?.id });
        }
      } catch (emailError) {
        const message =
          emailError instanceof Error ? emailError.message : "Unknown error";
        results.push({ email, success: false, error: message });
      }
    }

    // Update rate limits
    const successfulSends = results.filter((r) => r.success).length;
    if (successfulSends > 0) {
      const now = new Date();

      // Update organization rate limit
      if (orgRateLimit.rateLimitRef) {
        try {
          if (orgRateLimit.rateLimitDoc?.exists()) {
            await updateDoc(orgRateLimit.rateLimitRef, {
              count: increment(successfulSends),
            });
          } else {
            await setDoc(orgRateLimit.rateLimitRef, {
              count: successfulSends,
              organizationId,
              date: now.toISOString().split("T")[0],
              createdAt: now,
            });
          }
        } catch (error) {
          console.error("Error updating organization rate limit:", error);
        }
      }

      // Update user rate limit
      if (userRateLimit.rateLimitRef) {
        try {
          const hourStart = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            now.getHours()
          );
          if (userRateLimit.rateLimitDoc?.exists()) {
            await updateDoc(userRateLimit.rateLimitRef, {
              count: increment(successfulSends),
            });
          } else {
            await setDoc(userRateLimit.rateLimitRef, {
              count: successfulSends,
              userId,
              hour: hourStart.toISOString(),
              createdAt: now,
            });
          }
        } catch (error) {
          console.error("Error updating user rate limit:", error);
        }
      }

      // Update IP rate limit
      if (ipRateLimit.rateLimitRef) {
        try {
          const dayStart = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          if (ipRateLimit.rateLimitDoc?.exists()) {
            await updateDoc(ipRateLimit.rateLimitRef, {
              count: increment(successfulSends),
            });
          } else {
            await setDoc(ipRateLimit.rateLimitRef, {
              count: successfulSends,
              ip: ipRateLimit.ip,
              date: dayStart.toISOString().split("T")[0],
              createdAt: now,
            });
          }
        } catch (error) {
          console.error("Error updating IP rate limit:", error);
        }
      }
    }

    const allSucceeded = results.every((r) => r.success);

    if (allSucceeded) {
      return NextResponse.json({
        message: "Invitations sent successfully!",
        results,
      });
    } else {
      return NextResponse.json(
        { message: "Some invitations could not be sent.", results },
        { status: 207 }
      );
    }
  } catch (error) {
    console.error("Error processing invitation request:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: "Failed to process invitations.", details: errorMessage },
      { status: 500 }
    );
  }
}
