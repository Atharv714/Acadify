"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import {
  Organization,
  AppUser,
  OrgRole,
  UserOrgRole, // Added UserOrgRole for detailed department access
} from "@/lib/types";
import { fetchOrganizationMembersByDepartments } from "@/lib/departmentUtils"; // now backed by orgMemberships
import { localCache } from "@/lib/localCache";

// Legacy Organization type with customDepartments for backward compatibility
interface LegacyOrganization extends Organization {
  customDepartments?: { id: string; name: string }[];
}
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Users, Settings, PlusCircle, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DepartmentGroup {
  id: string; // Department ID
  name: string; // Department Name
  members: AppUser[];
  membersPreview?: AppUser[];
}

export default function TeamsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [organization, setOrganization] = useState<LegacyOrganization | null>(
    null
  );
  const [departmentGroups, setDepartmentGroups] = useState<DepartmentGroup[]>(
    []
  );
  const [allUsers, setAllUsers] = useState<AppUser[]>([]); // To map userIds to user details
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }

    if (user && user.organizationId) {
      // Cache-first pre-hydration
      const cachedMap = localCache.getDepartmentMembersMap(user.organizationId);
      if (cachedMap) {
        try {
          const cachedDeptGroups: DepartmentGroup[] = Array.from(
            cachedMap.entries()
          ).map(([deptId, members]) => ({
            id: deptId,
            name: deptId,
            members,
            membersPreview: members.slice(0, 4),
          }));
          // Show something quickly; real fetch below will refine names and filter
          if (cachedDeptGroups.length > 0) {
            setDepartmentGroups(cachedDeptGroups);
            setIsLoading(false);
          }
        } catch (e) {
          // ignore cache decode errors
        }
      }

      const currentOrgRole = user.orgRoles?.find(
        (role) => role.orgId === user.organizationId
      )?.orgRole;
      // Allow any authenticated user in an org to see teams for now, adjust if stricter permissions needed
      // if (currentOrgRole !== OrgRole.OWNER && currentOrgRole !== OrgRole.ADMIN) {
      //   toast.error("You don't have permission to view this page.");
      //   router.push('/dashboard');
      //   return;
      // }

      const fetchData = async () => {
        // Only show loader if we didn't hydrate from cache
        if (!cachedMap) setIsLoading(true);
        try {
          const orgDocRef = doc(db, "organizations", user.organizationId!);
          const orgDocSnap = await getDoc(orgDocRef);

          if (!orgDocSnap.exists()) {
            toast.error("Organization not found.");
            setOrganization(null);
            setIsLoading(false);
            return;
          }
          const orgData = {
            id: orgDocSnap.id,
            ...orgDocSnap.data(),
          } as LegacyOrganization;
          setOrganization(orgData);

          // Fetch modern departments to resolve names for modern-root IDs
          const modernSnap = await getDocs(
            query(
              collection(db, "departments"),
              where("orgId", "==", user.organizationId!)
            )
          );
          const modernDepartments = modernSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as any[];
          const modernRoots = modernDepartments.filter(
            (d) => !d.parentDepartmentId
          );

          // **UNIFIED: Use the scalable unified function for grouping members by departments**
          console.log(
            `🔄 Using UNIFIED fetchOrganizationMembersByDepartments for org: ${user.organizationId}`
          );
          const departmentMembersMap =
            await fetchOrganizationMembersByDepartments(user.organizationId!);
          // Cache the map for next navigation
          localCache.setDepartmentMembersMap(
            user.organizationId!,
            departmentMembersMap
          );

          // Collect unique users (memberships may repeat across departments)
          const seen = new Set<string>();
          const uniqueUsers: AppUser[] = [];
          departmentMembersMap.forEach((members) => {
            members.forEach((u) => {
              if (!u.uid) return;
              if (seen.has(u.uid)) return;
              seen.add(u.uid);
              uniqueUsers.push(u);
            });
          });
          setAllUsers(uniqueUsers);

          // Convert Map to DepartmentGroup format - FILTER to only show valid main departments
          const customDepartments = orgData.customDepartments || [];
          const departmentGroupData: DepartmentGroup[] = Array.from(
            departmentMembersMap.entries()
          )
            .map(([deptId, members]) => {
              const legacy = customDepartments.find((d) => d.id === deptId);
              const modern = modernRoots.find((d) => d.id === deptId);
              return {
                id: deptId,
                name: legacy
                  ? legacy.name
                  : modern
                    ? modern.name
                    : deptId === "unassigned-department"
                      ? "Unassigned"
                      : "Unknown Department",
                members,
                membersPreview: members.slice(0, 4),
              };
            })
            .filter((group) => {
              // Show groups for modern roots or legacy parents, and the special unassigned bucket
              const isLegacyRoot = customDepartments.some(
                (d) => d.id === group.id
              );
              const isModernRoot = modernRoots.some((d) => d.id === group.id);
              return (
                isLegacyRoot ||
                isModernRoot ||
                group.id === "unassigned-department"
              );
            });

          console.log(
            `✅ Grouped ${uniqueUsers.length} users via memberships into ${departmentGroupData.length} departments`
          );
          setDepartmentGroups(departmentGroupData);
        } catch (error) {
          console.error("Error fetching department/member data:", error);
          toast.error("Failed to load department/member data.");
        } finally {
          setIsLoading(false);
        }
      };
      fetchData();
    } else if (!authLoading && user && !user.organizationId) {
      toast.info("Please select or join an organization first.");
      router.push("/onboarding");
      setIsLoading(false);
    }
  }, [user, authLoading, router]);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const handleDepartmentGroupClick = (departmentId: string) => {
    setSelectedCardId(departmentId);
    setIsTransitioning(true);

    // Optimized PS5-style delay to match animation timing
    setTimeout(() => {
      router.push(`/dashboard/teams/${departmentId}`);
    }, 0); // Reduced delay to match animation duration
  };

  if (authLoading || (!user && !authLoading)) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex flex-col items-center space-y-4"
          >
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground font-medium">
              Loading teams...
            </p>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (!user?.organizationId && !authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Users className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Organization Selected</h2>
        <p className="text-muted-foreground mb-4 text-center">
          Please select or join an organization to manage teams.
        </p>
        <Button onClick={() => router.push("/onboarding")}>
          Go to Onboarding
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key="teams-page"
          initial={{ opacity: 1, scale: 1, rotateX: 0 }}
          animate={{
            opacity: isTransitioning ? 0 : 1,
            scale: isTransitioning ? 1.2 : 1, // Reduced scale to prevent overflow
            rotateX: isTransitioning ? -15 : 0, // Reduced rotation to prevent breaking
            filter: isTransitioning ? "blur(8px)" : "blur(0px)", // Reduced blur for smoother effect
          }}
          exit={{
            opacity: 0,
            scale: 2, // Reduced exit scale
            rotateX: -25, // Reduced exit rotation
            filter: "blur(20px)", // Reduced exit blur
          }}
          transition={{
            duration: isTransitioning ? 0.7 : 0.7, // Reduced duration to match navigation delay
            ease: isTransitioning
              ? [0.23, 1, 0.32, 1]
              : [0.25, 0.46, 0.45, 0.94],
            filter: { duration: 0.7 }, // Matched filter duration
          }}
          style={{
            transformStyle: "preserve-3d",
            perspective: 1000,
            transformOrigin: "center center", // Ensure transforms stay centered
          }}
          className="relative overflow-hidden" // Added overflow-hidden to prevent scrollbars
        >
          {/* PS5-style particle overlay during transition */}
          <AnimatePresence>
            {isTransitioning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 pointer-events-none"
              >
                {/* Particle effect background */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-cyan-600/10" />

                {/* Animated particles */}
                {Array.from({ length: 20 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{
                      opacity: 0,
                      scale: 0,
                      x: Math.random() * window.innerWidth,
                      y: Math.random() * window.innerHeight,
                    }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0],
                      x: Math.random() * window.innerWidth,
                      y: Math.random() * window.innerHeight,
                    }}
                    transition={{
                      duration: 1.5, // Reduced from 1.5 for faster particles
                      delay: i * 0.05, // Reduced delay for tighter timing
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="absolute w-1 h-1 bg-blue-400 rounded-full"
                  />
                ))}

                {/* Central loading indicator */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {" "}
                  <motion.div
                    initial={{ scale: 0, rotate: 0 }}
                    animate={{ scale: 1, rotate: 360 }}
                    transition={{ duration: 0.6, ease: "easeOut" }} // Reduced from 0.8 to match new timing
                    className="relative"
                  >
                    <div className="w-16 h-16 border-2 border-blue-500/30 rounded-full" />
                    <div className="absolute inset-0 w-16 h-16 border-2 border-transparent border-t-blue-500 rounded-full animate-spin" />
                    <div className="absolute inset-2 w-12 h-12 border border-cyan-400/50 rounded-full animate-pulse" />
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-4 md:p-6 overflow-hidden min-h-[calc(100vh-4rem)]">
            {" "}
            {/* Added min-height and contained overflow */}
            <header className="mb-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h1 className="text-3xl font-medium flex items-center montserrat">
                    Department Groups in{" "}
                    {organization?.name || "Your Organization"}
                  </h1>
                  <p className="text-muted-foreground mt-1 spacemono">
                    View members grouped by their assigned departments.
                  </p>
                </div>
                {/* Create New Team button removed as per new requirement */}
              </div>
            </header>
            {isLoading && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center py-20"
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="flex flex-col items-center space-y-4"
                  >
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground font-medium">
                      Loading department groups...
                    </p>
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            )}
            {!isLoading && departmentGroups.length === 0 && (
              <div className="text-center border-2 border-dashed border-muted rounded-lg">
                <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold text-muted-foreground">
                  No Department Groups Found
                </h3>
                <p className="text-muted-foreground">
                  No members are currently assigned to departments, or no
                  departments have been created yet.
                </p>
              </div>
            )}
            {!isLoading && departmentGroups.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 3xl:grid-cols-6 gap-6 overflow-hidden" // Added overflow-hidden to grid container
              >
                {departmentGroups.map((group, index) => (
                  <motion.div
                    key={group.id}
                    initial={{
                      opacity: 0,
                      x: 200,
                      scale: 0.7,
                      rotateY: 0,
                      rotateX: 0,
                    }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      scale: 1,
                      rotateY: 0,
                      rotateX: 0,
                    }}
                    transition={{
                      duration: 0.7,
                      delay: index * 0.04,
                      ease: [0.6, 0.45, 0.46, 0.94], // Windows 8 style aggressive easing
                      opacity: { duration: 0.3, delay: index * 0.04 },
                      scale: {
                        duration: 0.6,
                        delay: index * 0.04,
                        ease: [0.68, -0.55, 0.265, 1.55], // Bounce back effect
                      },
                    }}
                    style={{
                      transformStyle: "preserve-3d",
                      perspective: 1200,
                    }}
                  >
                    <Card
                      className={`overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group bg-card dark:bg-zinc-950 py-4 border border-border/50 hover:border-primary/20 ${
                        selectedCardId === group.id
                          ? "ring-4 ring-blue-500/50 border-blue-500/70 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-cyan-500/10 shadow-2xl shadow-blue-500/25"
                          : ""
                      }`}
                      onClick={() => handleDepartmentGroupClick(group.id)}
                    >
                      <CardHeader className="">
                        <CardTitle className="text-lg truncate group-hover:text-primary font-medium montserrat transition-colors duration-200">
                          {group.name}
                        </CardTitle>
                        <CardDescription className="text-xs truncate spacemono">
                          {group.members.length} member
                          {group.members.length === 1 ? "" : "s"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex items-center justify-center bg-card dark:bg-zinc-950 overflow-hidden mb-3">
                        {group.members && group.members.length > 0 ? (
                          <div className="grid grid-cols-2 grid-rows-2 gap-2 w-full h-full">
                            {/* Top-left cell */}
                            <div className="flex flex-col items-center justify-center">
                              {group.members[0] && (
                                <>
                                  <Avatar className="w-16 h-16 rounded-full mb-1">
                                    <AvatarImage
                                      src={
                                        group.members[0].photoURL || undefined
                                      }
                                      alt={
                                        group.members[0].displayName || "Member"
                                      }
                                    />
                                    <AvatarFallback className="text-2xl sm:text-3xl rounded-full bg-zinc-900 text-white">
                                      {group.members[0].firstName &&
                                      group.members[0].lastName
                                        ? `${group.members[0].firstName.charAt(
                                            0
                                          )}${group.members[0].lastName.charAt(
                                            0
                                          )}`.toUpperCase()
                                        : group.members[0].displayName
                                          ? (() => {
                                              const nameParts =
                                                group.members[0].displayName
                                                  .trim()
                                                  .split(" ")
                                                  .filter(
                                                    (part) => part.length > 0
                                                  );
                                              if (nameParts.length === 0)
                                                return "U";
                                              if (nameParts.length === 1) {
                                                const singleName = nameParts[0];
                                                return singleName.length > 1
                                                  ? `${singleName.charAt(
                                                      0
                                                    )}${singleName.charAt(
                                                      singleName.length - 1
                                                    )}`.toUpperCase()
                                                  : singleName
                                                      .charAt(0)
                                                      .toUpperCase();
                                              }
                                              return `${nameParts[0].charAt(
                                                0
                                              )}${nameParts[
                                                nameParts.length - 1
                                              ].charAt(0)}`.toUpperCase();
                                            })()
                                          : "U"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <p className="text-xs text-muted-foreground truncate w-16 text-center">
                                    {group.members[0].displayName?.split(
                                      " "
                                    )[0] || ""}
                                  </p>
                                </>
                              )}
                            </div>

                            {/* Top-right cell */}
                            <div className="flex flex-col items-center justify-center">
                              {group.members[1] && (
                                <>
                                  <Avatar className="w-16 h-16 rounded-full mb-1">
                                    <AvatarImage
                                      src={
                                        group.members[1].photoURL || undefined
                                      }
                                      alt={
                                        group.members[1].displayName || "Member"
                                      }
                                    />
                                    <AvatarFallback className="text-2xl sm:text-3xl rounded-full bg-zinc-900 text-white">
                                      {group.members[1].firstName &&
                                      group.members[1].lastName
                                        ? `${group.members[1].firstName.charAt(
                                            0
                                          )}${group.members[1].lastName.charAt(
                                            0
                                          )}`.toUpperCase()
                                        : group.members[1].displayName
                                          ? (() => {
                                              const nameParts =
                                                group.members[1].displayName
                                                  .trim()
                                                  .split(" ")
                                                  .filter(
                                                    (part) => part.length > 0
                                                  );
                                              if (nameParts.length === 0)
                                                return "U";
                                              if (nameParts.length === 1) {
                                                const singleName = nameParts[0];
                                                return singleName.length > 1
                                                  ? `${singleName.charAt(
                                                      0
                                                    )}${singleName.charAt(
                                                      singleName.length - 1
                                                    )}`.toUpperCase()
                                                  : singleName
                                                      .charAt(0)
                                                      .toUpperCase();
                                              }
                                              return `${nameParts[0].charAt(
                                                0
                                              )}${nameParts[
                                                nameParts.length - 1
                                              ].charAt(0)}`.toUpperCase();
                                            })()
                                          : "U"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <p className="text-xs text-muted-foreground truncate w-16 text-center">
                                    {group.members[1].displayName?.split(
                                      " "
                                    )[0] || ""}
                                  </p>
                                </>
                              )}
                            </div>

                            {/* Bottom-left cell */}
                            <div className="flex flex-col items-center justify-center">
                              {group.members[2] && (
                                <>
                                  <Avatar className="w-16 h-16 rounded-full mb-1">
                                    <AvatarImage
                                      src={
                                        group.members[2].photoURL || undefined
                                      }
                                      alt={
                                        group.members[2].displayName || "Member"
                                      }
                                    />
                                    <AvatarFallback className="text-2xl sm:text-3xl rounded-full bg-zinc-900 text-white">
                                      {group.members[2].firstName &&
                                      group.members[2].lastName
                                        ? `${group.members[2].firstName.charAt(
                                            0
                                          )}${group.members[2].lastName.charAt(
                                            0
                                          )}`.toUpperCase()
                                        : group.members[2].displayName
                                          ? (() => {
                                              const nameParts =
                                                group.members[2].displayName
                                                  .trim()
                                                  .split(" ")
                                                  .filter(
                                                    (part) => part.length > 0
                                                  );
                                              if (nameParts.length === 0)
                                                return "U";
                                              if (nameParts.length === 1) {
                                                const singleName = nameParts[0];
                                                return singleName.length > 1
                                                  ? `${singleName.charAt(
                                                      0
                                                    )}${singleName.charAt(
                                                      singleName.length - 1
                                                    )}`.toUpperCase()
                                                  : singleName
                                                      .charAt(0)
                                                      .toUpperCase();
                                              }
                                              return `${nameParts[0].charAt(
                                                0
                                              )}${nameParts[
                                                nameParts.length - 1
                                              ].charAt(0)}`.toUpperCase();
                                            })()
                                          : "U"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <p className="text-xs text-muted-foreground truncate w-16 text-center">
                                    {group.members[2].displayName?.split(
                                      " "
                                    )[0] || ""}
                                  </p>
                                </>
                              )}
                            </div>

                            {/* Bottom-right cell (can be a nested grid or 4th large avatar) */}
                            <div className="flex flex-col items-center justify-center">
                              {group.members.length > 3 ? (
                                <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                                  {group.members
                                    .slice(3, 7)
                                    .map((member, idx) => (
                                      <div
                                        key={member.uid || `sm-grid-${idx}`}
                                        className="flex items-center justify-center"
                                      >
                                        <Avatar className="w-9 h-9 rounded-full">
                                          <AvatarImage
                                            src={member.photoURL || undefined}
                                            alt={member.displayName || "Member"}
                                          />
                                          <AvatarFallback className="text-xs sm:text-sm rounded-full bg-black border border-zinc-900 text-white">
                                            {member.firstName && member.lastName
                                              ? `${member.firstName.charAt(
                                                  0
                                                )}${member.lastName.charAt(
                                                  0
                                                )}`.toUpperCase()
                                              : member.displayName
                                                ? (() => {
                                                    const nameParts =
                                                      member.displayName
                                                        .trim()
                                                        .split(" ")
                                                        .filter(
                                                          (part) =>
                                                            part.length > 0
                                                        );
                                                    if (nameParts.length === 0)
                                                      return "U";
                                                    if (
                                                      nameParts.length === 1
                                                    ) {
                                                      const singleName =
                                                        nameParts[0];
                                                      return singleName.length >
                                                        1
                                                        ? `${singleName.charAt(
                                                            0
                                                          )}${singleName.charAt(
                                                            singleName.length -
                                                              1
                                                          )}`.toUpperCase()
                                                        : singleName
                                                            .charAt(0)
                                                            .toUpperCase();
                                                    }
                                                    return `${nameParts[0].charAt(
                                                      0
                                                    )}${nameParts[
                                                      nameParts.length - 1
                                                    ].charAt(0)}`.toUpperCase();
                                                  })()
                                                : "U"}
                                          </AvatarFallback>
                                        </Avatar>
                                      </div>
                                    ))}
                                  {/* Fill empty spots in the small grid if less than 4 small avatars */}
                                  {Array.from({
                                    length: Math.max(
                                      0,
                                      4 - (group.members.length - 3)
                                    ),
                                  }).map((_, i) => (
                                    <div
                                      key={`empty-sm-${i}`}
                                      className="w-full h-full bg-transparent rounded-md aspect-square"
                                    ></div>
                                  ))}
                                </div>
                              ) : (
                                group.members[3] && (
                                  <>
                                    <Avatar className="w-16 h-16 rounded-full mb-1">
                                      <AvatarImage
                                        src={
                                          group.members[3].photoURL || undefined
                                        }
                                        alt={
                                          group.members[3].displayName ||
                                          "Member"
                                        }
                                      />
                                      <AvatarFallback className="text-2xl sm:text-3xl rounded-full bg-zinc-900 text-white">
                                        {group.members[3].firstName &&
                                        group.members[3].lastName
                                          ? `${group.members[3].firstName.charAt(
                                              0
                                            )}${group.members[3].lastName.charAt(
                                              0
                                            )}`.toUpperCase()
                                          : group.members[3].displayName
                                            ? (() => {
                                                const nameParts =
                                                  group.members[3].displayName
                                                    .trim()
                                                    .split(" ")
                                                    .filter(
                                                      (part) => part.length > 0
                                                    );
                                                if (nameParts.length === 0)
                                                  return "U";
                                                if (nameParts.length === 1) {
                                                  const singleName =
                                                    nameParts[0];
                                                  return singleName.length > 1
                                                    ? `${singleName.charAt(
                                                        0
                                                      )}${singleName.charAt(
                                                        singleName.length - 1
                                                      )}`.toUpperCase()
                                                    : singleName
                                                        .charAt(0)
                                                        .toUpperCase();
                                                }
                                                return `${nameParts[0].charAt(
                                                  0
                                                )}${nameParts[
                                                  nameParts.length - 1
                                                ].charAt(0)}`.toUpperCase();
                                              })()
                                            : "U"}
                                      </AvatarFallback>
                                    </Avatar>
                                    <p className="text-xs text-muted-foreground truncate w-16 text-center">
                                      {group.members[3].displayName?.split(
                                        " "
                                      )[0] || ""}
                                    </p>
                                  </>
                                )
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Users className="w-12 h-12 text-muted-foreground/30" />
                          </div>
                        )}
                      </CardContent>
                      {/* Optional: Add a footer for actions or more info if needed later */}
                      {/* <CardFooter className='pt-2 pb-3'>
                <Button variant='ghost' size='sm' className='w-full justify-start text-xs'>
                    View Details <ArrowRight className='ml-auto h-3 w-3'/>
                </Button>
              </CardFooter> */}
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
