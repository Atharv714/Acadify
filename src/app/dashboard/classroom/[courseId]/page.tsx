"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Loader2 } from "lucide-react";
import { collection, doc, getDocs, setDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Circle, Clock, AlertCircle, Eye, CircleCheck, Search, Hash, SortAsc, Filter, CalendarDays } from "lucide-react";
// Removed: import { ListView } from "@/components/list"; and Task type (not needed for table view)

interface Course { id: string; name?: string; section?: string; descriptionHeading?: string; alternateLink?: string; calendarId?: string }
interface ClassroomProfile { id?: string; name?: { fullName?: string }; photoUrl?: string; }
interface Teacher { userId?: string; profile?: ClassroomProfile }
interface Student { userId?: string; profile?: ClassroomProfile }
interface CourseWork { id: string; title?: string; description?: string; workType?: string; state?: string; dueDate?: { year:number; month:number; day:number }; dueTime?: { hours?: number; minutes?: number }; alternateLink?: string; }
interface Announcement { id: string; text?: string; state?: string; updateTime?: string; alternateLink?: string; }
interface CourseWorkMaterial { id: string; title?: string; alternateLink?: string; }
interface LocalCourseWorkState { id: string; status: "To Do" | "In Progress" | "In Review" | "Blocked" | "Completed"; priority: "Low" | "Medium" | "High"; dueDate?: Date | null }

function initials(name?: string) {
  if (!name) return "U";
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "U"; if (p.length === 1) { const n=p[0]; return (n.length>1?(n[0]+n[n.length-1]):n[0]).toUpperCase(); }
  return (p[0][0] + p[p.length-1][0]).toUpperCase();
}

export default function ClassroomCoursePage(){
  const { courseId } = useParams<{courseId:string}>();
  const router = useRouter();
  const [accessToken,setAccessToken]=useState<string|null>(null);
  const [signingIn,setSigningIn]=useState(false);
  const [course,setCourse]=useState<Course|null>(null);
  const [teachers,setTeachers]=useState<Teacher[]>([]);
  const [students,setStudents]=useState<Student[]>([]);
  const [courseWork,setCourseWork]=useState<CourseWork[]>([]);
  const [announcements,setAnnouncements]=useState<Announcement[]>([]);
  const [materials,setMaterials]=useState<CourseWorkMaterial[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [photoMap,setPhotoMap]=useState<Record<string,string>>({});
  const [localStates,setLocalStates]=useState<Record<string,LocalCourseWorkState>>({});
  const [uid,setUid]=useState<string|null>(typeof window!=="undefined"? (auth.currentUser?.uid||null): null);
  const [submissionStates, setSubmissionStates] = useState<Record<string,string>>({});
  const [needsMoreScopes, setNeedsMoreScopes] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [forcedScopesThisSession, setForcedScopesThisSession] = useState(false);

  // token load
  useEffect(()=>{
    const uTok = sessionStorage.getItem("unified_access_token");
    const uExp = Number(sessionStorage.getItem("unified_token_expires_at")||0);
    if (uTok && Date.now()<uExp) { setAccessToken(uTok); return; }
    const t=sessionStorage.getItem("classroom_access_token");
    const exp=Number(sessionStorage.getItem("classroom_token_expires_at")||0);
    if(t && Date.now()<exp) setAccessToken(t); else setAccessToken(null);
  },[]);

  const ensureAuth = async (force = false)=>{
    if(accessToken && !force) return;
    setSigningIn(true); setError(null);
    const provider=new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/classroom.courses.readonly");
    provider.addScope("https://www.googleapis.com/auth/classroom.rosters.readonly");
    provider.addScope("https://www.googleapis.com/auth/classroom.coursework.me.readonly");
    provider.addScope("https://www.googleapis.com/auth/classroom.announcements.readonly");
    provider.addScope("https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly");
    provider.addScope("https://www.googleapis.com/auth/calendar.readonly");
    provider.addScope("https://www.googleapis.com/auth/calendar.events");
    const params: Record<string,string> = { include_granted_scopes:"true" };
    if (force) params.prompt = "consent"; // force upgrade scopes
    provider.setCustomParameters(params);
    try{
      if (force) {
        sessionStorage.removeItem("classroom_access_token");
        sessionStorage.removeItem("classroom_token_expires_at");
      }
      const res=await signInWithPopup(auth,provider);
      const cred=GoogleAuthProvider.credentialFromResult(res); const tok=cred?.accessToken||null;
      if(tok){
        setAccessToken(tok);
        const exp=Date.now()+55*60*1000; sessionStorage.setItem("classroom_access_token",tok); sessionStorage.setItem("classroom_token_expires_at",String(exp));
        setNeedsMoreScopes(false);
      }
    }catch(e:any){setError(e.message||"Sign-in failed");}
    finally{setSigningIn(false);} 
  };

  // Fetch course + data
  useEffect(()=>{
    if(!courseId || !accessToken){ setLoading(false); return; }
    let cancelled=false; setLoading(true); setError(null);

    const baseFetch = async (url: string, label: string)=>{
      const res = await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
      if (res.status === 403) {
        try {
          // Read body once for diagnostics
          const body = await res.clone().json().catch(async ()=> (await res.clone().text()));
          console.error("Classroom API 403:", label, body);
          const msg = typeof body === 'string' ? body : (body?.error?.message || JSON.stringify(body));
          setError(prev => prev || `403 on ${label}: ${msg}`);
        } catch {
          console.error("Classroom API 403 (no body):", label);
        }
        // Only prompt for more scopes if it's NOT a roster call; roster 403 is common for students.
        if (!/\/(teachers|students)(\?|$)/.test(url)) {
          setNeedsMoreScopes(true);
        }
      }
      return res;
    };

    (async()=>{
      try{
        const cRes=await baseFetch(`https://classroom.googleapis.com/v1/courses/${courseId}`, "course");
        if(cRes.ok) setCourse(await cRes.json());
        const [tRes,sRes,cwRes,annRes,matRes]=await Promise.all([
          baseFetch(`https://classroom.googleapis.com/v1/courses/${courseId}/teachers?pageSize=200`, "teachers"),
          baseFetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students?pageSize=300`, "students"),
          baseFetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork?pageSize=100`, "courseWork"),
          baseFetch(`https://classroom.googleapis.com/v1/courses/${courseId}/announcements?pageSize=50`, "announcements"),
          baseFetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWorkMaterials?pageSize=100`, "materials"),
        ]);
        const [tData,sData,cwData,annData,matData]=await Promise.all([
          tRes.ok?tRes.json():{}, sRes.ok?sRes.json():{}, cwRes.ok?cwRes.json():{}, annRes.ok?annRes.json():{}, matRes.ok?matRes.json():{}
        ]);
        // Type guards
        const teachersArr = Array.isArray((tData as any).teachers) ? (tData as any).teachers : [];
        const studentsArr = Array.isArray((sData as any).students) ? (sData as any).students : [];
        const courseworkArr = Array.isArray((cwData as any).courseWork) ? (cwData as any).courseWork : [];
        const announcementsArr = Array.isArray((annData as any).announcements) ? (annData as any).announcements : [];
        const materialsArr = Array.isArray((matData as any).courseWorkMaterials) ? (matData as any).courseWorkMaterials : [];
        if(cancelled) return;
        setTeachers(teachersArr);
        setStudents(studentsArr);
        setCourseWork(courseworkArr);
        setAnnouncements(announcementsArr);
        setMaterials(materialsArr);
      }catch(e:any){ if(!cancelled) setError(e.message||"Failed to load course data"); }
      finally{ if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled=true; };
  },[courseId,accessToken]);

  // Photo fetch (auth protected) – simplified, only fetch new ones.
  useEffect(()=>{
    if(!accessToken) return;
    const needed: {id:string; url:string}[]=[];
    [...teachers,...students].forEach(p=>{ const id=p.profile?.id||p.userId; const url=p.profile?.photoUrl; if(id && url && !photoMap[id]) needed.push({id, url}); });
    if(!needed.length) return;
    let cancelled=false;
    (async()=>{
      const results=await Promise.all(needed.map(async n=>{ try{ const r=await fetch(n.url,{headers:{Authorization:`Bearer ${accessToken}`}}); if(!r.ok) throw 0; const b=await r.blob(); return {id:n.id, url:URL.createObjectURL(b)}; }catch{ return {id:n.id, url:""}; }}));
      if(cancelled) return; setPhotoMap(prev=>{ const next={...prev}; results.forEach(r=>{ if(r.url) next[r.id]=r.url; }); return next; });
    })();
    return ()=>{ cancelled=true; };
  },[teachers,students,accessToken,photoMap]);

  const participants = useMemo(()=>{
    return [
      ...teachers.map(t=>({ role:"Teacher", id:t.profile?.id||t.userId, name:(t.profile as any)?.name?.fullName, photo:photoMap[t.profile?.id||t.userId||""] || t.profile?.photoUrl })),
      ...students.map(s=>({ role:"Student", id:s.profile?.id||s.userId, name:(s.profile as any)?.name?.fullName, photo:photoMap[s.profile?.id||s.userId||""] || s.profile?.photoUrl }))
    ];
  },[teachers,students,photoMap]);

  const formatDue=(cw:CourseWork)=>{ if(!cw.dueDate) return ""; const {year,month,day}=cw.dueDate; const time=cw.dueTime?` ${cw.dueTime.hours?.toString().padStart(2,"0")||"00"}:${cw.dueTime.minutes?.toString().padStart(2,"0")||"00"}`:""; return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}${time}`; };

  useEffect(()=>{
    // Initialize local state entries when coursework loads and merge with Firestore if available
    setLocalStates(prev=>{
      const next={...prev};
      courseWork.forEach(cw=>{ if(!next[cw.id]) next[cw.id]={ id:cw.id, status:"To Do", priority:"Medium" }; });
      Object.keys(next).forEach(id=>{ if(!courseWork.find(c=>c.id===id)) delete next[id]; });
      return next;
    });

    // Fetch stored states from Firestore
    const load = async()=>{
      if(!uid || !courseId || !courseWork.length) return;
      try{
        const colRef = collection(db, "users", uid, "classroomCourses", String(courseId), "courseWorkStates");
        const snap = await getDocs(colRef);
        const fromDb: Record<string, LocalCourseWorkState> = {};
        snap.forEach(d=>{ const data=d.data() as any; if(d.id) fromDb[d.id]={ id:d.id, status:data.status||"To Do", priority:data.priority||"Medium" }; });
        if(Object.keys(fromDb).length){
          setLocalStates(prev=>({ ...prev, ...fromDb }));
        }
      }catch(e){ /* ignore */ }
    };
    load();
  },[courseWork, uid, courseId]);

  const persistState = async (id:string, s: LocalCourseWorkState)=>{
    if(!uid || !courseId) return;
    const ref = doc(collection(db, "users", uid, "classroomCourses", String(courseId), "courseWorkStates"), id);
    try{ await setDoc(ref, { status: s.status, priority: s.priority, updatedAt: serverTimestamp() }, { merge: true }); }catch(e){ /* ignore */ }
  };
  const updateStatus=(id:string, status:LocalCourseWorkState["status"])=>{
    setLocalStates(s=>{ const next={ ...(s[id]||{id, status:"To Do", priority:"Medium"}), status }; const merged={ ...s, [id]: next }; queueMicrotask(()=>persistState(id,next)); return merged; });
  };
  const updatePriority=(id:string, priority:LocalCourseWorkState["priority"])=>{
    setLocalStates(s=>{ const next={ ...(s[id]||{id, status:"To Do", priority}), priority }; const merged={ ...s, [id]: next }; queueMicrotask(()=>persistState(id,next)); return merged; });
  };
  const updateDueDate = (id: string, dueDate: Date | null)=>{
    setLocalStates(s=>{ const prev = s[id] || { id, status: "To Do", priority: "Medium" };
      const next = { ...prev, dueDate } as LocalCourseWorkState; const merged={ ...s, [id]: next }; queueMicrotask(()=>persistState(id,next)); return merged; });
  };

  const taskStatuses = ["To Do", "In Progress", "In Review", "Blocked", "Completed"] as const;
  const taskPriorities = ["Low", "Medium", "High"] as const;
  // Parity UI states (search + filters + sorting like project table view)
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [dueDateFilter, setDueDateFilter] = useState<string>("");
  const [taskSort, setTaskSort] = useState<string>("");
  // Date popover open state per coursework (track id)
  const [openDueDatePickerFor, setOpenDueDatePickerFor] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    let items = courseWork.map(cw => {
      const ls = localStates[cw.id];
      let due: Date | null = null;
      if (ls?.dueDate) due = ls.dueDate; else if (cw.dueDate) {
        due = new Date(cw.dueDate.year, cw.dueDate.month - 1, cw.dueDate.day, cw.dueTime?.hours||0, cw.dueTime?.minutes||0);
      }
      const now = new Date();
      const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const submissionState = submissionStates[cw.id] || "";
      let dueState: "Completed" | "Missed" | "Due" = "Due";
      if (submissionState === "TURNED_IN" || submissionState === "RETURNED") {
        dueState = "Completed";
      } else if (due) {
        const dOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        if (dOnly < todayOnly) dueState = "Missed"; else dueState = "Due";
      }
      return {
        id: cw.id,
        title: cw.title || "(untitled)",
        description: cw.description || "",
        status: ls?.status || "To Do",
        priority: ls?.priority || "Medium",
        due,
        workType: cw.workType || "",
        state: cw.state || submissionState || "",
        dueState,
        link: cw.alternateLink || ""
      };
    });
    if (taskSearchQuery.trim()) {
      const q = taskSearchQuery.toLowerCase();
      items = items.filter(i => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    if (statusFilter.length) items = items.filter(i => statusFilter.includes(i.status));
    if (priorityFilter.length) items = items.filter(i => priorityFilter.includes(i.priority));
    if (dueDateFilter) {
      const today = new Date();
      const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const tomorrow = new Date(base); tomorrow.setDate(base.getDate()+1);
      const yesterday = new Date(base); yesterday.setDate(base.getDate()-1);
      const weekStart = new Date(base); weekStart.setDate(base.getDate()-base.getDay());
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
      items = items.filter(i => {
        if(!i.due) return false;
        const dOnly = new Date(i.due.getFullYear(), i.due.getMonth(), i.due.getDate());
        switch(dueDateFilter){
          case "tomorrow": return dOnly.getTime()===tomorrow.getTime();
          case "yesterday": return dOnly.getTime()===yesterday.getTime();
          case "this-week": return dOnly>=weekStart && dOnly<=weekEnd;
          default: return true;
        }
      });
    }
    if (taskSort === "name-asc") items.sort((a,b)=>a.title.localeCompare(b.title));
    if (taskSort === "name-desc") items.sort((a,b)=>b.title.localeCompare(a.title));
    return items;
  }, [courseWork, localStates, submissionStates, taskSearchQuery, statusFilter, priorityFilter, dueDateFilter, taskSort]);

  // Fetch student submission states
  useEffect(()=>{
    if(!accessToken || !courseId || !courseWork.length) return;
    let cancelled = false;
    const baseFetch=(url:string)=>fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
    (async()=>{
      try {
        // Limit concurrency to avoid hammering API
        const chunks: CourseWork[][] = [];
        const size = 10;
        for(let i=0;i<courseWork.length;i+=size) chunks.push(courseWork.slice(i,i+size));
        const states: Record<string,string> = {};
        for(const chunk of chunks){
          const results = await Promise.all(chunk.map(async cw => {
            try {
              const r = await baseFetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${cw.id}/studentSubmissions?userId=me`);
              if(r.status===403){
                try{ const b=await r.clone().json().catch(async()=> (await r.clone().text())); console.error("studentSubmissions 403", cw.id, b);}catch{}
                return { id: cw.id, state: "" };
              }
              if(!r.ok) return { id: cw.id, state: "" };
              const data = await r.json();
              const subs = Array.isArray(data.studentSubmissions) ? data.studentSubmissions : [];
              // For current user there should be max 1; take first
              const state = subs[0]?.state || ""; // e.g. NEW, CREATED, TURNED_IN, RETURNED
              return { id: cw.id, state };
            } catch { return { id: cw.id, state: "" }; }
          }));
          results.forEach(r=>{ states[r.id]=r.state; });
          if(cancelled) return;
          setSubmissionStates(prev=>({ ...prev, ...states }));
        }
      } catch { /* ignore */ }
    })();
    return ()=>{ cancelled=true; };
  },[accessToken, courseId, courseWork]);

  // Fetch Calendar events for this course
  useEffect(()=>{
    if(!accessToken || !course?.calendarId) return;
    const calId = course.calendarId; if(!calId) return;
    let cancelled=false; setCalendarError(null);
    (async()=>{
      try {
        const timeMin = new Date(Date.now() - 7*24*60*60*1000).toISOString(); // past week
        const timeMax = new Date(Date.now() + 90*24*60*60*1000).toISOString(); // next 90 days
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
        const res = await fetch(url,{ headers:{ Authorization:`Bearer ${accessToken}` }});
        if(res.status===403){ setNeedsMoreScopes(true); try{ const b=await res.clone().json().catch(async()=> (await res.clone().text())); console.error("Calendar 403", b);}catch{} setCalendarError("Calendar access denied (403). Re-authorize."); return; }
        if(!res.ok){ setCalendarError(`Failed to load calendar events (${res.status})`); return; }
        const data = await res.json();
        const events = Array.isArray(data.items)? data.items: [];
        if(!cancelled) setCalendarEvents(events);
      } catch(e:any){ if(!cancelled) setCalendarError(e.message||"Calendar fetch error"); }
    })();
    return ()=>{ cancelled=true; };
  },[accessToken, course?.calendarId]);

  useEffect(()=>{
    if(needsMoreScopes && !forcedScopesThisSession && !signingIn){
      setForcedScopesThisSession(true);
      // Attempt to force-consent automatically once
      ensureAuth(true);
    }
  },[needsMoreScopes, forcedScopesThisSession, signingIn]);

  useEffect(() => {
    // Index classwork items (courseWork) for Spotlight search
    const uidNow = auth.currentUser?.uid;
    if (!uidNow || !courseId || !courseWork.length) return;
    try {
      const batch = writeBatch(db);
      courseWork.forEach(cw => {
        if (!cw.id) return;
        const dueIso = cw.dueDate ? new Date(cw.dueDate.year, cw.dueDate.month - 1, cw.dueDate.day, cw.dueTime?.hours || 0, cw.dueTime?.minutes || 0).toISOString() : null;
        const metaRef = doc(collection(db, "users", uidNow, "classroomCourses", String(courseId), "courseWorkMeta"), cw.id);
        batch.set(metaRef, {
          uid: uidNow,
          courseId: String(courseId),
          courseName: course?.name || null,
          title: cw.title || "(untitled)",
          description: cw.description || null,
          workType: cw.workType || null,
          dueDate: dueIso,
          state: cw.state || null,
          updatedAt: Date.now(),
        }, { merge: true });
      });
      batch.commit();
    } catch (e) {
      console.warn("[Classroom] indexing coursework failed", e);
    }
  }, [courseWork, course?.name, courseId]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-start flex-wrap gap-4">
        <Button variant="ghost" size="sm" onClick={()=>router.push('/dashboard/classroom')} className="gap-1">
          <ArrowLeft className="h-4 w-4"/> Back
        </Button>
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-2xl font-semibold montserrat leading-tight">{course?.name || 'Course'}{course?.section? <span className="text-muted-foreground font-normal"> • {course.section}</span>:null}</h1>
          {course?.alternateLink && <a className="text-xs text-blue-500 hover:underline" href={course.alternateLink} target="_blank" rel="noreferrer">Open in Classroom</a>}
        </div>
        {!accessToken && <Button onClick={()=>ensureAuth()} disabled={signingIn}>{signingIn? <Loader2 className="h-4 w-4 animate-spin"/>: 'Connect Google Classroom'}</Button>}
        {accessToken && needsMoreScopes && (
          <Button variant="outline" size="sm" onClick={()=>ensureAuth(true)} disabled={signingIn} className="ml-auto">
            {signingIn ? 'Requesting…' : 'Grant additional permissions'}
          </Button>
        )}
      </div>
      {needsMoreScopes && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 p-3 text-sm flex items-center justify-between">
          <span>Google Classroom needs extra permissions (announcements/materials/roster). Re-authorize to continue.</span>
          <Button size="sm" variant="ghost" onClick={()=>ensureAuth(true)}>Authorize</Button>
        </div>
      )}

      {error && <div className="text-sm text-red-500">{error}</div>}

      {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Loading...</div>}

      {!loading && accessToken && (
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="mb-4 flex flex-wrap gap-2">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="classwork">Classwork ({courseWork.length})</TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Assignments</CardTitle><CardDescription className="text-2xl font-semibold">{courseWork.length}</CardDescription></CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Announcements</CardTitle><CardDescription className="text-2xl font-semibold">{announcements.length}</CardDescription></CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Materials</CardTitle><CardDescription className="text-2xl font-semibold">{materials.length}</CardDescription></CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Calendar Events</CardTitle><CardDescription className="text-2xl font-semibold">{calendarEvents.length}</CardDescription></CardHeader>
              </Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3"><CardTitle className="text-base">Upcoming Due</CardTitle><CardDescription>Next 10 items with a due date</CardDescription></CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {courseWork.filter(cw=>cw.dueDate).sort((a,b)=>{
                    const da = new Date(a.dueDate!.year, a.dueDate!.month-1, a.dueDate!.day, a.dueTime?.hours||0, a.dueTime?.minutes||0).getTime();
                    const db = new Date(b.dueDate!.year, b.dueDate!.month-1, b.dueDate!.day, b.dueTime?.hours||0, b.dueTime?.minutes||0).getTime();
                    return da - db;
                  }).slice(0,10).map(cw=> (
                    <div key={cw.id} className="flex items-start justify-between gap-4 border-b last:border-b-0 pb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{cw.title || '(untitled)'}</p>
                        <p className="text-xs text-muted-foreground truncate">{cw.workType || ''} {cw.state? `• ${cw.state}`:''}</p>
                      </div>
                      {cw.dueDate && <span className="text-xs text-muted-foreground whitespace-nowrap">{`${cw.dueDate.year}-${String(cw.dueDate.month).padStart(2,'0')}-${String(cw.dueDate.day).padStart(2,'0')}`}</span>}
                    </div>
                  ))}
                  {courseWork.filter(cw=>cw.dueDate).length===0 && <p className="text-xs text-muted-foreground">No dated items.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Recent Announcements</CardTitle><CardDescription>Latest 5</CardDescription></CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {announcements.slice(0,5).map(a=> (
                    <div key={a.id} className="text-xs border-b last:border-b-0 pb-2">
                      <p className="font-medium line-clamp-2">{a.text || '(no text)'}</p>
                      <p className="text-muted-foreground mt-0.5">{a.updateTime? new Date(a.updateTime).toLocaleDateString(): ''}</p>
                    </div>
                  ))}
                  {announcements.length===0 && <p className="text-xs text-muted-foreground">No announcements.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Course Calendar</CardTitle><CardDescription>Next 10 events</CardDescription></CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {calendarError && <p className="text-xs text-red-500">{calendarError}</p>}
                  {!calendarError && calendarEvents.slice(0,10).map(ev=>{
                    const start = ev.start?.dateTime || ev.start?.date || "";
                    const dateLabel = start ? new Date(start).toLocaleDateString() : "";
                    return (
                      <div key={ev.id} className="text-xs border-b last:border-b-0 pb-2">
                        <p className="font-medium line-clamp-2">{ev.summary || '(no title)'}</p>
                        <p className="text-muted-foreground mt-0.5">{dateLabel}</p>
                      </div>
                    );
                  })}
                  {!calendarError && calendarEvents.length===0 && <p className="text-xs text-muted-foreground">No upcoming events.</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* classwork Tab (Coursework list) */}
          <TabsContent value="classwork" className="space-y-3">
            {courseWork.length === 0 && <p className="text-sm text-muted-foreground">No coursework.</p>}
            {courseWork.length > 0 && (
              <Card className="rounded-none border-0 -mx-6 -my-4 dark:bg-black py-3">
                <CardContent className="px-0">
                  {/* View Switch (single Table active for parity visuals) */}
                  <div className="px-4 mb-3 flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
                      <button className="px-3 py-1 text-xs rounded-md bg-background shadow-inner">Table</button>
                      <button className="px-3 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground transition-colors">Board</button>
                      <button className="px-3 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground transition-colors">List</button>
                      <button className="px-3 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground transition-colors">Timeline</button>
                    </div>
                    {/* Search */}
                    <div className="relative flex-1 max-w-sm ml-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="cw-search-input"
                        placeholder="Search assignments..."
                        value={taskSearchQuery}
                        onChange={(e)=>setTaskSearchQuery(e.target.value)}
                        className="pl-9 pr-12 h-8 text-sm"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1">
                        {typeof navigator!=="undefined" && navigator.platform.toLowerCase().includes("mac") ? (
                          <>
                            <Kbd className="key-icon">⌘</Kbd>
                            <Kbd>/</Kbd>
                          </>
                        ): (
                          <>
                            <Kbd>Ctrl</Kbd>
                            <Kbd>/</Kbd>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-[900px] overflow-x-auto">
                    <Table className="table-fixed w-full proximavara text-[14.5px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-b border-t">
                          <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[40%]">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center gap-2 hover:text-foreground transition-colors">
                                  <Hash className="h-3 w-3" />
                                  Assignment
                                  <SortAsc className="h-3 w-3" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium">Sort</Label>
                                  <div className="space-y-1">
                                    <button onClick={()=>setTaskSort("name-asc")} className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors", taskSort==="name-asc"?"bg-muted":"hover:bg-muted/50")}>Title A-Z</button>
                                    <button onClick={()=>setTaskSort("name-desc")} className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors", taskSort==="name-desc"?"bg-muted":"hover:bg-muted/50")}>Title Z-A</button>
                                    <button onClick={()=>setTaskSort("")} className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors", taskSort===""?"bg-muted":"hover:bg-muted/50")}>Clear</button>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </TableHead>
                          <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[10%]">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center gap-2 hover:text-foreground transition-colors">Status <Filter className="h-3 w-3"/></button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium">Filter by Status</Label>
                                  <div className="space-y-1">
                                    {taskStatuses.map(s=> (
                                      <div key={s} className="flex items-center space-x-2">
                                        <Checkbox id={`status-${s}`} checked={statusFilter.includes(s)} onCheckedChange={(checked)=>{ if(checked){ setStatusFilter([...statusFilter, s]); } else { setStatusFilter(statusFilter.filter(x=>x!==s)); } }} />
                                        <Label htmlFor={`status-${s}`} className="text-xs">{s}</Label>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </TableHead>
                          <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[10%]">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center gap-2 hover:text-foreground transition-colors">Priority <Filter className="h-3 w-3"/></button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium">Filter by Priority</Label>
                                  <div className="space-y-1">
                                    {taskPriorities.map(p=> (
                                      <div key={p} className="flex items-center space-x-2">
                                        <Checkbox id={`priority-${p}`} checked={priorityFilter.includes(p)} onCheckedChange={(checked)=>{ if(checked){ setPriorityFilter([...priorityFilter, p]); } else { setPriorityFilter(priorityFilter.filter(x=>x!==p)); } }} />
                                        <Label htmlFor={`priority-${p}`} className="text-xs flex items-center gap-2">
                                          <div className={cn("w-2 h-2 rounded-full", p==="High"&&"bg-red-500", p==="Medium"&&"bg-yellow-500", p==="Low"&&"bg-green-500")} /> {p}
                                        </Label>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </TableHead>
                          <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[12%]">Due Date</TableHead>
                          <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[13%]">Type</TableHead>
                          <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[13%]">State</TableHead>
                          <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[5%]">Open</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map(i => (
                              <TableRow key={i.id} className="group border-b hover:bg-muted/30 transition-all">
                                <TableCell className="px-14 py-2 w-[40%] max-w-0">
                                  <div className="flex items-start gap-2 min-w-0">
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="p-0.5 hover:bg-muted rounded-sm" title={`Change status (${i.status})`}>
                                          {i.status === "To Do" && <Circle className="h-4 w-4 text-zinc-600"/>}
                                          {i.status === "In Progress" && <Clock className="h-4 w-4 text-blue-600"/>}
                                          {i.status === "Blocked" && <AlertCircle className="h-4 w-4 text-red-600"/>}
                                          {i.status === "In Review" && <Eye className="h-4 w-4 text-yellow-600"/>}
                                          {i.status === "Completed" && <CircleCheck className="h-4 w-4 text-green-600"/>}
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-48 p-1 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                        <div className="flex flex-col gap-1">
                                          {taskStatuses.map(s => (
                                            <button key={s} onClick={()=>updateStatus(i.id, s as any)} className={cn("flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm text-left", i.status===s?"bg-muted":"hover:bg-muted/50")}>
                                              {s === "To Do" && <Circle className="h-3.5 w-3.5"/>}
                                              {s === "In Progress" && <Clock className="h-3.5 w-3.5 text-blue-600"/>}
                                              {s === "Blocked" && <AlertCircle className="h-3.5 w-3.5 text-red-600"/>}
                                              {s === "In Review" && <Eye className="h-3.5 w-3.5 text-yellow-600"/>}
                                              {s === "Completed" && <CircleCheck className="h-3.5 w-3.5 text-green-600"/>}
                                              {s}
                                            </button>
                                          ))}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                    <div className="min-w-0">
                                      <p className={cn("truncate font-medium", i.status==="Completed" && "line-through opacity-70")}>{i.title}</p>
                                      {i.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{i.description}</p>}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-2 w-[10%]">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="h-6 px-2 text-xs rounded-full bg-muted/40 hover:bg-muted/60 flex items-center gap-1">
                                        {i.status}
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-40 p-1 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                      <div className="flex flex-col gap-1">
                                        {taskStatuses.map(s => (
                                          <button key={s} onClick={()=>updateStatus(i.id, s as any)} className={cn("px-2 py-1.5 text-xs rounded-sm text-left", i.status===s?"bg-muted":"hover:bg-muted/50")}>{s}</button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </TableCell>
                                <TableCell className="px-4 py-5 w-[10%]">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="h-6 px-2 text-xs rounded-full bg-muted/40 hover:bg-muted/60 flex items-center gap-1">
                                        <div className={cn("w-2 h-2 rounded-full", i.priority==="High"&&"bg-red-500", i.priority==="Medium"&&"bg-yellow-500", i.priority==="Low"&&"bg-green-500")}/>
                                        {i.priority}
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-40 p-1 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                      <div className="flex flex-col gap-1">
                                        {taskPriorities.map(p => (
                                          <button key={p} onClick={()=>updatePriority(i.id, p as any)} className={cn("px-2 py-1.5 text-xs rounded-sm text-left flex items-center gap-2", i.priority===p?"bg-muted":"hover:bg-muted/50")}> <div className={cn("w-2 h-2 rounded-full", p==="High"&&"bg-red-500", p==="Medium"&&"bg-yellow-500", p==="Low"&&"bg-green-500")}/> {p}</button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </TableCell>
                                <TableCell className="px-4 py-2 w-[12%]">
                                  <Popover open={openDueDatePickerFor===i.id} onOpenChange={(o)=> setOpenDueDatePickerFor(o? i.id: null)}>
                                    <PopoverTrigger asChild>
                                      <button className={cn("h-6 px-2 text-xs rounded-full border-0 bg-muted/40 hover:bg-muted/60 w-auto gap-1.5 flex items-center", !i.due && "text-muted-foreground")}> 
                                        <CalendarDays className="h-3.5 w-3.5"/>
                                        {i.due ? format(i.due, "MMM dd") : <span>Set date</span>}
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 backdrop-blur-[10px] dark:bg-black/10 bg-white/10 border-1" align="start">
                                      <Calendar
                                        mode="single"
                                        selected={i.due || undefined}
                                        onSelect={(date)=> { updateDueDate(i.id, date || null); setOpenDueDatePickerFor(null); }}
                                        initialFocus
                                        disabled={(date)=> date < new Date(new Date().setDate(new Date().getDate()-1))}
                                      />
                                      <div className="p-2 border-t border-border/50">
                                        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-destructive h-7 text-xs" onClick={()=> { updateDueDate(i.id, null); setOpenDueDatePickerFor(null); }} disabled={!i.due}>Clear date</Button>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </TableCell>
                                <TableCell className="px-4 py-2 w-[13%]">
                                  {i.workType ? <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-[11px] font-medium">{i.workType}</span> : <span className="text-xs text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="px-4 py-2 w-[13%]">
                                  <span
                                    className={cn(
                                      "inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium",
                                      i.dueState === "Missed" && "bg-red-500/20 text-red-500",
                                      i.dueState === "Due" && "bg-yellow-500/20 text-yellow-600",
                                      i.dueState === "Completed" && "bg-green-500/20 text-green-600"
                                    )}
                                  >
                                    {i.dueState}
                                  </span>
                                </TableCell>
                                <TableCell className="py-2 w-[5%] text-right">
                                  {i.link && <Button variant="ghost" size="sm" className="text-xs" onClick={()=> window.open(i.link, '_blank')}>Open</Button>}
                                </TableCell>
                              </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {!accessToken && !loading && (
        <div className="text-sm text-muted-foreground">Connect Google Classroom to view course details.</div>
      )}
    </div>
  );
}
