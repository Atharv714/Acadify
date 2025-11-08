import { NextResponse } from "next/server";
import { Resend } from "resend";
import InvitationEmail from "@/emails/invitation-email";
import InvitationEmailText from "@/emails/invitation-email-text";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { 
  checkOrganizationRateLimit, 
  checkUserRateLimit, 
  checkIPRateLimit,
  updateRateLimitCounters,
  RATE_LIMITS 
} from "@/lib/rateLimiting";

const resend = new Resend(process.env.RESEND_API_KEY);

// Helper function to verify user authentication and organization membership
async function verifyUserAndOrganization(request: Request, organizationId: string) {
  try {
    // Get authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { error: "No valid authorization header", status: 401 };
    }

    const idToken = authHeader.split("Bearer ")[1];
    
    // For Firebase ID tokens, we'll verify them directly with Firebase Admin
    // For now, let's implement a simpler check using the user's UID from the token
    
    // Extract user ID from the request or token
    // This is a simplified approach - in production, use Firebase Admin SDK
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
    if (!userData.organizations || !userData.organizations.includes(organizationId)) {
      return { error: "User not authorized for this organization", status: 403 };
    }

    // Check if user has permission to send invites (admin or owner role)
    const memberRef = doc(db, "organizations", organizationId, "members", userId);
    const memberDoc = await getDoc(memberRef);
    
    if (!memberDoc.exists()) {
      return { error: "User membership not found in organization", status: 403 };
    }

    const memberData = memberDoc.data();
    const allowedRoles = ["admin", "owner"];
    
    if (!allowedRoles.includes(memberData.role)) {
      return { error: "Insufficient permissions to send invitations", status: 403 };
    }

    return { userId, userRole: memberData.role };
  } catch (error) {
    console.error("Error verifying user and organization:", error);
    return { error: "Authentication verification failed", status: 500 };
  }
}

// Helper function to check user-specific rate limiting
async function checkUserRateLimit(userId: string, emailCount: number) {
  const now = new Date();
  const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const rateLimitDocId = `user-${userId}-${hourStart.toISOString()}`;
  const rateLimitRef = doc(db, "userRateLimits", rateLimitDocId);

  try {
    const rateLimitDoc = await getDoc(rateLimitRef);
    const currentCount = rateLimitDoc.exists() ? (rateLimitDoc.data().count || 0) : 0;

    if (currentCount + emailCount > USER_RATE_LIMIT_MAX_EMAILS) {
      return {
        exceeded: true,
        currentCount,
        limit: USER_RATE_LIMIT_MAX_EMAILS
      };
    }

    return { exceeded: false, rateLimitRef, currentCount };
  } catch (error) {
    console.error("Error checking user rate limit:", error);
    return { exceeded: false }; // Allow if check fails
  }
}

// Helper function to check IP-based rate limiting (additional security layer)
async function checkIPRateLimit(request: Request, emailCount: number) {
  const IP_RATE_LIMIT_MAX_EMAILS = 50; // Per IP per day
  const IP_RATE_LIMIT_WINDOW_HOURS = 24;

  // Get client IP
  const forwarded = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0] || realIP || "unknown";

  if (ip === "unknown") {
    return { exceeded: false }; // Allow if IP can't be determined
  }

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rateLimitDocId = `ip-${ip.replace(/\./g, "-")}-${dayStart.toISOString().split("T")[0]}`;
  const rateLimitRef = doc(db, "ipRateLimits", rateLimitDocId);

  try {
    const rateLimitDoc = await getDoc(rateLimitRef);
    const currentCount = rateLimitDoc.exists() ? (rateLimitDoc.data().count || 0) : 0;

    if (currentCount + emailCount > IP_RATE_LIMIT_MAX_EMAILS) {
      return {
        exceeded: true,
        currentCount,
        limit: IP_RATE_LIMIT_MAX_EMAILS,
        ip
      };
    }

    return { exceeded: false, rateLimitRef, currentCount, ip };
  } catch (error) {
    console.error("Error checking IP rate limit:", error);
    return { exceeded: false }; // Allow if check fails
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

    const { userId, userRole } = authResult as { userId: string; userRole: string };

    if (!process.env.RESEND_API_KEY) {
      console.error("Resend API Key is not configured.");
      return NextResponse.json(
        { error: "Server configuration error: Email service is not set up." },
        { status: 500 }
      );
    }

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "Email list is required and cannot be empty." },
        { status: 400 }
      );
    }
    
    // Limit the number of emails in a single request
    if (emails.length > 10) {
      return NextResponse.json(
        { error: "Cannot send more than 10 invitations at once." },
        { status: 400 }
      );
    }
    
    if (!organizationName || !organizationId) {
      return NextResponse.json(
        { error: "Organization name and ID are required." },
        { status: 400 }
      );
    }

    // Check user-specific rate limiting
    const userRateLimit = await checkUserRateLimit(userId, emails.length);
    if (userRateLimit.exceeded) {
      return NextResponse.json(
        {
          error: `Personal rate limit exceeded. You can only send ${USER_RATE_LIMIT_MAX_EMAILS} invitations per hour. Current usage: ${userRateLimit.currentCount}/${USER_RATE_LIMIT_MAX_EMAILS}`,
        },
        { status: 429 }
      );
    }

    // Check IP-based rate limiting (additional security layer)
    const ipRateLimit = await checkIPRateLimit(request, emails.length);
    if (ipRateLimit.exceeded) {
      return NextResponse.json(
        {
          error: `IP rate limit exceeded. Maximum ${ipRateLimit.limit} invitations per day from this IP address. Current usage: ${ipRateLimit.currentCount}/${ipRateLimit.limit}`,
        },
        { status: 429 }
      );
    }

    // Check rate limit
    const now = new Date();
    const rateLimitDocId = `${organizationId}-${now.toISOString().split("T")[0]}`; // daily rate limit per org
    const rateLimitRef = doc(db, "rateLimits", rateLimitDocId);

    let rateLimitDoc;
    try {
      rateLimitDoc = await getDoc(rateLimitRef);
      const currentCount = rateLimitDoc.exists()
        ? rateLimitDoc.data().count || 0
        : 0;

      if (currentCount + emails.length > RATE_LIMIT_MAX_EMAILS) {
        return NextResponse.json(
          {
            error: `Rate limit exceeded. Organization can only send ${RATE_LIMIT_MAX_EMAILS} invitations per day. Current usage: ${currentCount}/${RATE_LIMIT_MAX_EMAILS}`,
          },
          { status: 429 }
        );
      }
    } catch (error) {
      console.error("Error checking rate limit:", error);
      // Continue without rate limiting if there's an error checking it
    }

    // Get organization details including invite code
    const orgRef = doc(db, "organizations", organizationId);
    const orgDoc = await getDoc(orgRef);

    if (!orgDoc.exists()) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 }
      );
    }

    const orgData = orgDoc.data();
    const inviteCode = orgData.inviteCode;

    if (!inviteCode) {
      return NextResponse.json(
        { error: "Organization invite code not found." },
        { status: 500 }
      );
    }

    // Validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter((email) => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        { error: `Invalid email format for: ${invalidEmails.join(", ")}` },
        { status: 400 }
      );
    }

    const results = [];

    for (const email of emails) {
      // Create invite link with joining code
      const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/join-organization?code=${inviteCode}&email=${encodeURIComponent(email)}`;

      try {
        const data = await resend.emails.send({
          from: `Magnifi <invitations@magnifi.space>`, // Using your domain here
          to: email,
          subject: `Invitation to join ${organizationName}`,
          react: InvitationEmail({
            organizationName,
            inviterName,
            inviteLink,
            customMessage,
            invitedUserEmail: email,
            organizationLogo: `${process.env.NEXT_PUBLIC_APP_URL || "https://magnifi.space"}/magnifi-m.png`, // Use magnifi-m.png
            joiningCode: inviteCode, // Add joining code to email
          }),
          text: InvitationEmailText({
            organizationName,
            inviterName,
            inviteLink,
            customMessage,
            invitedUserEmail: email,
            joiningCode: inviteCode, // Add joining code to text email
          }),
        });

        if (data.error) {
          console.error(`Failed to send email to ${email}:`, data.error);
          results.push({ email, success: false, error: data.error.message });
        } else {
          results.push({ email, success: true, emailId: data.data?.id });
        }
      } catch (emailError) {
        console.error(`Exception sending email to ${email}:`, emailError);
        const message =
          emailError instanceof Error ? emailError.message : "Unknown error";
        results.push({ email, success: false, error: message });
      }
    }

    // Update rate limit counters for both organization and user
    const successfulSends = results.filter((r) => r.success).length;
    
    if (successfulSends > 0) {
      // Update organization rate limit
      if (rateLimitDoc) {
        try {
          const rateLimitUpdate = rateLimitDoc.exists()
            ? updateDoc(rateLimitRef, { count: increment(successfulSends) })
            : setDoc(rateLimitRef, {
                count: successfulSends,
                organizationId,
                date: now.toISOString().split("T")[0],
                createdAt: now,
              });
          await rateLimitUpdate;
        } catch (error) {
          console.error("Error updating organization rate limit:", error);
        }
      }

      // Update user rate limit
      if (userRateLimit.rateLimitRef) {
        try {
          const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
          const userRateLimitUpdate = userRateLimit.currentCount > 0
            ? updateDoc(userRateLimit.rateLimitRef, { count: increment(successfulSends) })
            : setDoc(userRateLimit.rateLimitRef, {
                count: successfulSends,
                userId,
                hour: hourStart.toISOString(),
                createdAt: now,
              });
          await userRateLimitUpdate;
        } catch (error) {
          console.error("Error updating user rate limit:", error);
        }
      }

      // Update IP rate limit
      if (ipRateLimit.rateLimitRef) {
        try {
          const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const ipRateLimitUpdate = ipRateLimit.currentCount > 0
            ? updateDoc(ipRateLimit.rateLimitRef, { count: increment(successfulSends) })
            : setDoc(ipRateLimit.rateLimitRef, {
                count: successfulSends,
                ip: ipRateLimit.ip,
                date: dayStart.toISOString().split("T")[0],
                createdAt: now,
              });
          await ipRateLimitUpdate;
        } catch (error) {
          console.error("Error updating IP rate limit:", error);
        }
      }
    }

    const allSucceeded = results.every((r) => r.success);
    const someFailed = results.some((r) => !r.success);

    if (allSucceeded) {
      return NextResponse.json({
        message: "Invitations sent successfully!",
        results,
      });
    } else if (someFailed) {
      return NextResponse.json(
        {
          message: "Some invitations could not be sent.",
          results,
        },
        { status: 207 }
      ); // 207 Multi-Status
    } else {
      // Should not happen if emails array is not empty
      return NextResponse.json(
        { error: "Failed to send invitations for an unknown reason." },
        { status: 500 }
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
