"use client";
import React, { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

interface ClassroomCourse {
  id: string;
  name?: string;
  section?: string;
  courseState?: string;
  alternateLink?: string;
}
// Add types for assignments and posts
interface CourseWork {
  id: string;
  title?: string;
  description?: string;
  workType?: string; // ASSIGNMENT, SHORT_ANSWER_QUESTION, etc.
  state?: string; // PUBLISHED, DRAFT, etc.
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours?: number; minutes?: number };
  alternateLink?: string;
}
interface Announcement {
  id: string;
  text?: string;
  state?: string;
  updateTime?: string;
  alternateLink?: string;
}
interface CourseWorkMaterial {
  id: string;
  title?: string;
  alternateLink?: string;
}

const ClassroomPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  
  const CLASSROOM_API_BASE = process.env.NEXT_PUBLIC_CLASSROOM_API_BASE || "https://classroom.googleapis.com/v1";
  const [error, setError] = useState<string | null>(null);
  // Map courseId -> details
  const [courseData, setCourseData] = useState<Record<string, {
    courseWork: CourseWork[];
    announcements: Announcement[];
    materials: CourseWorkMaterial[];
  }>>({});

  // Load token from sessionStorage on mount
  useEffect(() => {
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
    provider.addScope("https://www.googleapis.com/auth/classroom.coursework.me.readonly");
    provider.addScope("https://www.googleapis.com/auth/classroom.announcements.readonly");
    provider.addScope("https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly");
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

  useEffect(() => {
    const fetchCourses = async () => {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      try {
        const coursesResponse = await fetch(
          `${CLASSROOM_API_BASE}/courses?courseStates=ACTIVE&pageSize=20`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (!coursesResponse.ok) throw new Error(`Courses fetch failed: ${coursesResponse.status}`);
        const data = await coursesResponse.json();
        setCourses((data.courses || []) as ClassroomCourse[]);
      } catch (e: any) {
        setError(e.message || "Failed to load courses");
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, [accessToken]);

  // After courses load, fetch assignments, announcements, and materials per course
  useEffect(() => {
    const fetchPerCourse = async () => {
      if (!accessToken || courses.length === 0) return;
      setLoading(true);
      try {
        const authedFetch = (url: string) =>
          fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

        const results: Record<string, { courseWork: CourseWork[]; announcements: Announcement[]; materials: CourseWorkMaterial[]; }> = {};
        await Promise.all(
          courses.map(async (c) => {
            const cid = c.id;
            try {
              const [cwRes, annRes, matRes] = await Promise.all([
                authedFetch(`${CLASSROOM_API_BASE}/courses/${cid}/courseWork?pageSize=50`),
                authedFetch(`${CLASSROOM_API_BASE}/courses/${cid}/announcements?pageSize=50`),
                authedFetch(`${CLASSROOM_API_BASE}/courses/${cid}/courseWorkMaterials?pageSize=50`),
              ]);
              const [cwData, annData, matData] = await Promise.all([
                cwRes.ok ? cwRes.json() : Promise.resolve({}),
                annRes.ok ? annRes.json() : Promise.resolve({}),
                matRes.ok ? matRes.json() : Promise.resolve({}),
              ]);
              results[cid] = {
                courseWork: (cwData.courseWork || []) as CourseWork[],
                announcements: (annData.announcements || []) as Announcement[],
                materials: (matData.courseWorkMaterials || []) as CourseWorkMaterial[],
              };
            } catch (_) {
              results[cid] = { courseWork: [], announcements: [], materials: [] };
            }
          })
        );
        setCourseData(results);
      } finally {
        setLoading(false);
      }
    };
    fetchPerCourse();
  }, [accessToken, courses]);

  const formatDue = (cw: CourseWork) => {
    if (!cw.dueDate) return undefined;
    const { year, month, day } = cw.dueDate;
    const time = cw.dueTime ? ` ${cw.dueTime.hours?.toString().padStart(2, "0") || "00"}:${cw.dueTime.minutes?.toString().padStart(2, "0") || "00"}` : "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}${time}`;
  };

  return (
    <div style={{ padding: "1.5rem" }}>
      <h1>Classroom</h1>
      {!accessToken && (
        <button onClick={signInForClassroom}>Sign in with Google & Authorize Classroom</button>
      )}
      {accessToken && <p>Access token acquired.</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>Loading...</p>}
      {!loading && courses.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {courses.map((c) => {
            const data = courseData[c.id] || { courseWork: [], announcements: [], materials: [] };
            return (
              <li key={c.id} style={{ borderBottom: "1px solid #ddd", marginBottom: "1rem", paddingBottom: "1rem" }}>
                <div><strong>{c.name}</strong>{c.section ? ` • ${c.section}` : ""}</div>
                <div style={{ fontSize: "0.85rem", color: "#666" }}>State: {c.courseState}</div>
                {c.alternateLink && (
                  <div style={{ marginTop: "0.25rem" }}>
                    <a href={c.alternateLink} target="_blank" rel="noreferrer">Open in Classroom</a>
                  </div>
                )}

                {/* Assignments */}
                <div style={{ marginTop: "0.75rem" }}>
                  <div style={{ fontWeight: 600 }}>Assignments ({data.courseWork.length})</div>
                  {data.courseWork.length === 0 && <div style={{ color: "#666", fontSize: "0.9rem" }}>No assignments.</div>}
                  {data.courseWork.length > 0 && (
                    <ul style={{ marginTop: "0.25rem" }}>
                      {data.courseWork.map((w) => (
                        <li key={w.id} style={{ marginBottom: "0.5rem" }}>
                          <div>
                            {w.title || "(untitled)"} {w.workType ? `• ${w.workType}` : ""} {w.state ? `• ${w.state}` : ""}
                            {w.alternateLink && (
                              <> • <a href={w.alternateLink} target="_blank" rel="noreferrer">Open</a></>
                            )}
                          </div>
                          {formatDue(w) && <div style={{ fontSize: "0.85rem", color: "#666" }}>Due: {formatDue(w)}</div>}
                          {w.description && <div style={{ fontSize: "0.9rem", color: "#444" }}>{w.description}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Announcements */}
                <div style={{ marginTop: "0.75rem" }}>
                  <div style={{ fontWeight: 600 }}>Announcements ({data.announcements.length})</div>
                  {data.announcements.length === 0 && <div style={{ color: "#666", fontSize: "0.9rem" }}>No announcements.</div>}
                  {data.announcements.length > 0 && (
                    <ul style={{ marginTop: "0.25rem" }}>
                      {data.announcements.map((a) => (
                        <li key={a.id} style={{ marginBottom: "0.5rem" }}>
                          <div>{a.text || "(no text)"}</div>
                          <div style={{ fontSize: "0.85rem", color: "#666" }}>{a.state}{a.updateTime ? ` • ${new Date(a.updateTime).toLocaleString()}` : ""}</div>
                          {a.alternateLink && (
                            <div style={{ fontSize: "0.85rem" }}>
                              <a href={a.alternateLink} target="_blank" rel="noreferrer">Open</a>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Materials */}
                <div style={{ marginTop: "0.75rem" }}>
                  <div style={{ fontWeight: 600 }}>Materials ({data.materials.length})</div>
                  {data.materials.length === 0 && <div style={{ color: "#666", fontSize: "0.9rem" }}>No materials.</div>}
                  {data.materials.length > 0 && (
                    <ul style={{ marginTop: "0.25rem" }}>
                      {data.materials.map((m) => (
                        <li key={m.id} style={{ marginBottom: "0.5rem" }}>
                          <div>{m.title || "(untitled)"} {m.alternateLink && (
                            <> • <a href={m.alternateLink} target="_blank" rel="noreferrer">Open</a></>
                          )}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {accessToken && !loading && courses.length === 0 && <p>No courses found.</p>}
      <p style={{ marginTop: "2rem", fontSize: "0.75rem", color: "#666" }}>
        Scopes used: classroom.courses.readonly, classroom.coursework.me.readonly, classroom.announcements.readonly, classroom.courseworkmaterials.readonly. Add submissions scopes if you need student submissions.
      </p>
    </div>
  );
};

export default ClassroomPage;
