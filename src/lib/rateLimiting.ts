import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";
export const RATE_LIMITS = {
  ORGANIZATION: {
    MAX_EMAILS: 25,
    WINDOW_HOURS: 24,
  },
  USER: {
    MAX_EMAILS: 25,
    WINDOW_HOURS: 24,
  },
  IP: {
    MAX_EMAILS: 50,
    WINDOW_HOURS: 24,
  },
  BATCH: {
    MAX_EMAILS: 25,
  },
} as const;

export interface RateLimitResult {
  exceeded: boolean;
  currentCount?: number;
  limit?: number;
  rateLimitRef?: any;
  ip?: string;
}


export async function checkOrganizationRateLimit(
  organizationId: string,
  emailCount: number
): Promise<RateLimitResult> {
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

    return {
      exceeded: false,
      rateLimitRef,
      currentCount,
    };
  } catch (error) {
    console.error("Error checking organization rate limit:", error);
    return { exceeded: false };
  }
}

/**
 * Check user-level rate limiting (hourly)
 */
export async function checkUserRateLimit(
  userId: string,
  emailCount: number
): Promise<RateLimitResult> {
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

    return {
      exceeded: false,
      rateLimitRef,
      currentCount,
    };
  } catch (error) {
    console.error("Error checking user rate limit:", error);
    return { exceeded: false };
  }
}

/**
 * Check IP-level rate limiting (daily)
 */
export async function checkIPRateLimit(
  request: Request,
  emailCount: number
): Promise<RateLimitResult> {

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

    return {
      exceeded: false,
      rateLimitRef,
      currentCount,
      ip,
    };
  } catch (error) {
    console.error("Error checking IP rate limit:", error);
    return { exceeded: false };
  }
}

/**
 * Update rate limit counters after successful email sends
 */
export async function updateRateLimitCounters(
  orgRateLimit: RateLimitResult,
  userRateLimit: RateLimitResult,
  ipRateLimit: RateLimitResult,
  successfulSends: number,
  organizationId: string,
  userId: string
): Promise<void> {
  const now = new Date();


  if (orgRateLimit.rateLimitRef && successfulSends > 0) {
    try {
      const rateLimitUpdate =
        orgRateLimit.currentCount! > 0
          ? updateDoc(orgRateLimit.rateLimitRef, {
              count: increment(successfulSends),
            })
          : setDoc(orgRateLimit.rateLimitRef, {
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


  if (userRateLimit.rateLimitRef && successfulSends > 0) {
    try {
      const hourStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours()
      );
      const userRateLimitUpdate =
        userRateLimit.currentCount! > 0
          ? updateDoc(userRateLimit.rateLimitRef, {
              count: increment(successfulSends),
            })
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


  if (ipRateLimit.rateLimitRef && successfulSends > 0) {
    try {
      const dayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      const ipRateLimitUpdate =
        ipRateLimit.currentCount! > 0
          ? updateDoc(ipRateLimit.rateLimitRef, {
              count: increment(successfulSends),
            })
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
