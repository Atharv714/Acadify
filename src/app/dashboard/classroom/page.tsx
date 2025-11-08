"use client";

import React, { useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { writeBatch, doc, collection } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";

// Color palette to mimic department Projects cards
const COLORS = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6"];

interface ClassroomCourse {
  id: string;
  name?: string;
  section?: string;
  courseState?: string;
  alternateLink?: string;
}

interface ClassroomProfile {
  id?: string;
  name?: { fullName?: string } | any;
  photoUrl?: string;
}

interface ClassroomTeacher { userId?: string; profile?: ClassroomProfile }
interface ClassroomStudent { userId?: string; profile?: ClassroomProfile }

interface MemberPreview {
  uid?: string;
  displayName?: string;
  photoURL?: string | null;
  role?: "Teacher" | "Student";
}

interface CourseGroup {
  id: string;
  name: string;
  totalMembers: number;
  members: MemberPreview[]; // teachers first then students
  alternateLink?: string;
}

export default function ClassroomDashboardPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<CourseGroup[]>([]);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const router = useRouter();

  // Load token from sessionStorage on mount
  useEffect(() => {
    const uTok = sessionStorage.getItem("unified_access_token");
    const uExp = Number(sessionStorage.getItem("unified_token_expires_at") || 0);
    if (uTok && uExp && Date.now() < uExp) {
      setAccessToken(uTok);
      return;
    }
    const token = sessionStorage.getItem("classroom_access_token");
    const exp = Number(sessionStorage.getItem("classroom_token_expires_at") || 0);
    if (token && exp && Date.now() < exp) {
      setAccessToken(token);
    }
  }, []);

  const signInForClassroom = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/classroom.courses.readonly");
    provider.addScope("https://www.googleapis.com/auth/classroom.rosters.readonly");
    provider.setCustomParameters({ include_granted_scopes: "true" });
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      if (token) {
        setAccessToken(token);
        // Soft expiry ~55min
        const exp = Date.now() + 55 * 60 * 1000;
        sessionStorage.setItem("classroom_access_token", token);
        sessionStorage.setItem("classroom_token_expires_at", String(exp));
      }
    } catch (e: any) {
      setError(e.message || "Sign-in failed");
    }
  };

  // Fetch courses, then roster per course
  useEffect(() => {
    const fetchData = async () => {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const CLASSROOM_API_BASE = process.env.NEXT_PUBLIC_CLASSROOM_API_BASE || "https://classroom.googleapis.com/v1";
        const authedFetch = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        const coursesRes = await authedFetch(`${CLASSROOM_API_BASE}/courses?courseStates=ACTIVE&pageSize=50`);
        if (!coursesRes.ok) throw new Error(`Failed to fetch courses: ${coursesRes.status}`);
        const coursesData = await coursesRes.json();
        const courses: ClassroomCourse[] = (coursesData.courses || []);

        const results: CourseGroup[] = [];
        await Promise.all(
          courses.map(async (c) => {
            const cid = c.id;
            try {
              const [teachersRes, studentsRes] = await Promise.all([
                authedFetch(`${CLASSROOM_API_BASE}/courses/${cid}/teachers?pageSize=200`),
                authedFetch(`${CLASSROOM_API_BASE}/courses/${cid}/students?pageSize=200`),
              ]);
              const [teachersData, studentsData] = await Promise.all([
                teachersRes.ok ? teachersRes.json() : Promise.resolve({}),
                studentsRes.ok ? studentsRes.json() : Promise.resolve({}),
              ]);
              const teachers: ClassroomTeacher[] = (teachersData.teachers || []) as ClassroomTeacher[];
              const students: ClassroomStudent[] = (studentsData.students || []) as ClassroomStudent[];

              const teacherMembers: MemberPreview[] = teachers.map((t) => ({
                uid: t.profile?.id || t.userId,
                displayName: (t.profile as any)?.name?.fullName,
                photoURL: t.profile?.photoUrl || null,
                role: "Teacher",
              }));
              const studentMembers: MemberPreview[] = students.map((s) => ({
                uid: s.profile?.id || s.userId,
                displayName: (s.profile as any)?.name?.fullName,
                photoURL: s.profile?.photoUrl || null,
                role: "Student",
              }));

              results.push({
                id: cid!,
                name: c.name || "(untitled)",
                totalMembers: teacherMembers.length + studentMembers.length,
                members: [...teacherMembers, ...studentMembers],
                alternateLink: c.alternateLink,
              });
            } catch (e) {
              results.push({
                id: cid!,
                name: c.name || "(untitled)",
                totalMembers: 0,
                members: [],
                alternateLink: c.alternateLink,
              });
            }
          })
        );
        setGroups(results);

        // --- Firestore indexing for Global Spotlight (courses) ---
        const uid = auth.currentUser?.uid;
        if (uid && courses.length) {
          try {
            const batch = writeBatch(db);
            courses.forEach((c) => {
              if (!c.id) return;
              const metaRef = doc(collection(db, "users", uid, "classroomCourses", c.id, "classroomCourseMeta"), c.id);
              batch.set(metaRef, {
                uid,
                courseId: c.id,
                courseName: c.name || "(untitled)",
                section: c.section || null,
                description: c.alternateLink || null,
                updatedAt: Date.now(),
              }, { merge: true });
            });
            await batch.commit();
          } catch (e) {
            console.warn("[Classroom] failed to write course meta", e);
          }
        }
        // --- end Firestore indexing ---
      } catch (e: any) {
        setError(e.message || "Failed to load Classroom data");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [accessToken]);

  const handleCardClick = (group: CourseGroup) => {
    setSelectedCardId(group.id);
    setIsTransitioning(true);
    setTimeout(() => {
      router.push(`/dashboard/classroom/${group.id}`);
    }, 0);
  };

  return (
    <div className="overflow-hidden">
      <div className="p-4 md:p-6 overflow-hidden min-h-[calc(100vh-4rem)]">
        <header className="mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-medium flex items-center montserrat">Classroom Courses</h1>
              <p className="text-muted-foreground mt-1 spacemono">
                View your Google Classroom courses.
              </p>
            </div>
            {!accessToken && (
              <Button onClick={signInForClassroom}>Connect Google Classroom</Button>
            )}
          </div>
        </header>

        {error && (
          <div className="text-red-500 text-sm mb-4">{error}</div>
        )}

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
                  Loading Classroom...
                </p>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="text-center border-2 border-dashed border-muted rounded-lg p-8">
            <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold text-muted-foreground">
              No Courses Found
            </h3>
            <p className="text-muted-foreground">
              {accessToken ? "You don't seem to be enrolled in any active courses." : "Connect Google Classroom to view your courses."}
            </p>
          </div>
        )}

        {!isLoading && groups.length > 0 && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground spacemono">
              {groups.length} course{groups.length === 1 ? "" : "s"} in total
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 3xl:grid-cols-6 gap-6 overflow-hidden"
            >
              {groups.map((group, index) => (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, x: 300, scale: 0.8 }}
                  animate={
                    isTransitioning
                      ? group.id === selectedCardId
                        ? (() => {
                            const gridCols =
                              window.innerWidth >= 1536
                                ? 6
                                : window.innerWidth >= 1280
                                  ? 5
                                  : window.innerWidth >= 1024
                                    ? 4
                                    : window.innerWidth >= 768
                                      ? 3
                                      : window.innerWidth >= 640
                                        ? 3
                                        : 2;
                            const selectedIndex = groups.findIndex((p) => p.id === selectedCardId);
                            const row = Math.floor(selectedIndex / gridCols);
                            const col = selectedIndex % gridCols;
                            const centerCol = (gridCols - 1) / 2;
                            const moveTowardsCenter = (centerCol - col) * 100;
                            return { opacity: 1, x: moveTowardsCenter, scale: 1.15, zIndex: 10, y: 0 };
                          })()
                        : (() => {
                            const selectedIndex = groups.findIndex((p) => p.id === selectedCardId);
                            const isLeftOfSelected = index < selectedIndex;
                            const isRightOfSelected = index > selectedIndex;
                            return {
                              opacity: 0,
                              x: isLeftOfSelected ? -900 : isRightOfSelected ? 900 : index % 2 === 0 ? -900 : 900,
                              scale: 0.7,
                            };
                          })()
                      : { opacity: 1, x: 0, scale: 1 }
                  }
                  transition={
                    isTransitioning
                      ? group.id === selectedCardId
                        ? { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }
                        : { duration: 0.6, delay: Math.abs(index) * 0.03, ease: [0.25, 0.1, 0.25, 1] }
                      : { duration: 0.6, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }
                  }
                >
                  <div
                    className={`group rounded-lg shadow-sm hover:shadow-xl border overflow-hidden h-[240px] transform transition-all duration-300 hover:scale-[1.03] bg-card dark:bg-zinc-950 relative flex flex-col cursor-pointer`}
                    onClick={() => handleCardClick(group)}
                  >
                    {/* Content container */}
                    <div className="flex-1 p-5 flex flex-col">
                      {/* Course name & color */}
                      <div className="flex items-start gap-2 mb-3">
                        <div
                          className="w-4 h-4 rounded-full mt-1 flex-shrink-0"
                          style={{
                            backgroundColor: COLORS[index % COLORS.length],
                            boxShadow: "0 0 0 2px rgba(255,255,255,0.15)",
                          }}
                        />
                        <div>
                          <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors duration-200">
                            {group.name}
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {"Google Classroom course"}
                          </p>
                        </div>
                      </div>

                      {/* Info items */}
                      <div className="mt-auto space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>
                            {group.totalMembers || 0} {group.totalMembers === 1 ? "participant" : "participants"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-between p-4 backdrop-blur-[1.5px] translate-y-1 group-hover:translate-y-0">
                      <Button
                        variant="default"
                        size="sm"
                        className="text-xs transition-transform duration-300 transform translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 delay-75"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCardClick(group);
                        }}
                      >
                        Open
                      </Button>

                      {group.alternateLink && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-white/90 transition-transform duration-300 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 delay-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(group.alternateLink!, "_blank");
                          }}
                        >
                          Open in Classroom
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
