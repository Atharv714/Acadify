"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { useTheme } from "next-themes";
import { toast, Toaster } from "sonner";
import {
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  Home,
  Briefcase,
  CheckSquare,
  LucideCheckCircle2,
  User,
  UserRoundCog as PeopleIcon, // Renamed to avoid conflict with Users from dropdown
  Settings2,
  Settings,
  Pin,
  PinOff,
  Mail, // added
} from "lucide-react";

import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  runTransaction,
  Transaction,
} from "firebase/firestore"; // Added Firestore functions
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"; // Added DropdownMenu components
import { ChevronsUpDown, PlusCircle, Users } from "lucide-react"; // Added icons for dropdown
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { UserOrgRole, OrgRole } from "@/lib/types"; // Remove Organization usage

interface UserProfile {
  email: string;
  uid: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  department?: string;
  position?: string;
  photoURL?: string;
  organizationId?: string;
  createdAt?: any;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading: authLoading } = useAuth(); // Added authLoading
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false); // For mobile
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // For desktop collapse
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  // Add collegeName state
  const [collegeName, setCollegeName] = useState<string | null>(null);

  // Helper function to get the correct display name
  const getDisplayName = () => {
    if (userProfile?.displayName) return userProfile.displayName;
    if (userProfile?.firstName && userProfile?.lastName) {
      return `${userProfile.firstName} ${userProfile.lastName}`;
    }
    if (user?.displayName) return user.displayName;
    return "User";
  };

  // Helper function to get initials
  const getInitials = () => {
    const name = getDisplayName();
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Helper function to get the user's photo URL
  const getPhotoURL = () => {
    return userProfile?.photoURL || user?.photoURL || null;
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Clear the session cookie
      document.cookie =
        "session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT";
      toast.success("Logged out successfully");
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to log out");
    }
  };

  const [mounted, setMounted] = useState(false);

  // useEffect to handle mounting state and fetch user profile
  useEffect(() => {
    setMounted(true);
    if (user) {
      (async () => {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          const data = snap.data() || {};
          setCollegeName(data.collegeName || null);
          setUserProfile({
            email: data.email || user.email || "",
            uid: user.uid,
            displayName: data.displayName,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            department: data.department,
            position: data.position,
            photoURL: data.photoURL,
            organizationId: data.organizationId,
            createdAt: data.createdAt,
          });
        } catch (e) {
          console.error("load user sidebar", e);
        }
      })();
    }
  }, [user]); // Dependency array includes user to refetch when user object changes

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // Prevent hydration mismatch by not rendering theme toggle until mounted
  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* No header - simplified design */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-16 flex items-center px-4 border-b dark:bg-black bg-white/95 backdrop-blur-sm dark:border-white/10 border-zinc-200">
        <Button
          variant="ghost"
          size="icon"
          className="mr-2"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu className="h-5 w-5 dark:text-white text-zinc-900" />
          <span className="sr-only">Toggle menu</span>
        </Button>

        <div className="flex-1">
          {collegeName && (
            <span className="text-[15.5px] outfit font-medium dark:text-white text-zinc-900">
              {collegeName}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Sidebar - Glassmorphic Design */}
        <aside
          data-sidebar-collapsed={sidebarCollapsed}
          className={`fixed inset-y-0 left-0 z-20 flex flex-col transition-all duration-300 md:translate-x-0 
          dark:bg-black bg-white dark:text-white text-zinc-900 backdrop-blur-md 
          border-r dark:border-white/10 border-zinc-200 shadow-xl ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } ${sidebarCollapsed ? "w-16" : "w-64"}`}
        >
          {/* Removed Organization Selector */}

          {/* Navigation - Modern, sleek glassmorphic design */}
          <nav className="flex-1 overflow-auto py-5 px-3">
            {!sidebarCollapsed && (
              <div className="mb-2.5 px-3">
                <h3 className="text-xs uppercase tracking-wider dark:text-white/60 text-zinc-500 outfit font-medium">
                  Main
                </h3>
              </div>
            )}
            <ul className={`${sidebarCollapsed ? "px-1 space-y-2" : "px-1"}`}>
              <li>
                <Link
                  href="/dashboard"
                  className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"} rounded-lg px-3 py-2.5 text-[15.5px] outfit font-medium transition-all group ${
                    pathname === "/dashboard"
                      ? "border-none dark:bg-zinc-900 bg-zinc-900 backdrop-blur-sm"
                      : "border-none dark:hover:bg-white/5 hover:bg-zinc-100"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? "Dashboard" : undefined}
                >
                  <div
                    className={`${sidebarCollapsed ? "w-6 h-6" : "w-7 h-6"} flex items-center justify-center ${
                      pathname === "/dashboard" ? "" : ""
                    }`}
                  >
                    <Home
                      className={`h-3.5 w-3.5 ${
                        pathname === "/dashboard"
                          ? "dark:text-white text-white"
                          : "dark:text-white/70 text-zinc-500 group-hover:dark:text-white group-hover:text-zinc-700"
                      }`}
                    />
                  </div>
                  {!sidebarCollapsed && (
                    <span
                      className={
                        pathname === "/dashboard"
                          ? "dark:text-white text-white"
                          : "dark:text-white/80 text-zinc-600 group-hover:dark:text-white group-hover:text-zinc-800"
                      }
                    >
                      Dashboard
                    </span>
                  )}
                </Link>
              </li>
              {/* Inbox link */}
              <li>
                <Link
                  href="/dashboard/inbox"
                  className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"} rounded-lg px-3 py-2.5 text-[15.5px] outfit font-medium transition-all group ${
                    pathname === "/dashboard/inbox"
                      ? "border-none dark:bg-zinc-900 bg-zinc-900 backdrop-blur-sm"
                      : "border-none dark:hover:bg-white/5 hover:bg-zinc-100"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? "Inbox" : undefined}
                >
                  <div
                    className={`${sidebarCollapsed ? "w-6 h-6" : "w-7 h-6"} flex items-center justify-center ${
                      pathname === "/dashboard/inbox" ? "" : ""
                    }`}
                  >
                    <Mail
                      className={`h-3.5 w-3.5 ${
                        pathname === "/dashboard/inbox"
                          ? "dark:text-white text-white"
                          : "dark:text-white/70 text-zinc-500 group-hover:dark:text-white group-hover:text-zinc-700"
                      }`}
                    />
                  </div>
                  {!sidebarCollapsed && (
                    <span
                      className={
                        pathname === "/dashboard/inbox"
                          ? "dark:text-white text-white"
                          : "dark:text-white/80 text-zinc-600 group-hover:dark:text-white group-hover:text-zinc-800"
                      }
                    >
                      Inbox
                    </span>
                  )}
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/classroom"
                  className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"} rounded-lg px-3 py-2.5 text-[15.5px] outfit font-medium transition-all group ${
                    pathname === "/dashboard/classroom"
                      ? "border-none dark:bg-zinc-900 bg-zinc-900 backdrop-blur-sm"
                      : "border-none dark:hover:bg-white/5 hover:bg-zinc-100"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? "Classroom" : undefined}
                >
                  <div
                    className={`${sidebarCollapsed ? "w-6 h-6" : "w-7 h-6"} flex items-center justify-center ${
                      pathname === "/dashboard/classroom" ? "" : ""
                    }`}
                  >
                    <Users
                      className={`h-3.5 w-3.5 ${
                        pathname === "/dashboard/classroom"
                          ? "dark:text-white text-white"
                          : "dark:text-white/70 text-zinc-500 group-hover:dark:text-white group-hover:text-zinc-700"
                      }`}
                    />
                  </div>
                  {!sidebarCollapsed && (
                    <span
                      className={
                        pathname === "/dashboard/classroom"
                          ? "dark:text-white text-white"
                          : "dark:text-white/80 text-zinc-600 group-hover:dark:text-white group-hover:text-zinc-800"
                      }
                    >
                      Classroom
                    </span>
                  )}
                </Link>
              </li>
              <li>
                <Link
                  href="/profile"
                  className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"} rounded-lg px-3 py-2.5 text-[15.5px] outfit font-medium transition-all group ${
                    pathname === "/profile"
                      ? "border-none dark:bg-zinc-900 bg-zinc-900 backdrop-blur-sm"
                      : "border-none dark:hover:bg-white/5 hover:bg-zinc-100"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? "Profile" : undefined}
                >
                  <div
                    className={`${sidebarCollapsed ? "w-6 h-6" : "w-7 h-6"} flex items-center justify-center ${
                      pathname === "/profile" ? "" : ""
                    }`}
                  >
                    <User
                      className={`h-3.5 w-3.5 ${
                        pathname === "/profile"
                          ? "dark:text-white text-white"
                          : "dark:text-white/70 text-zinc-500 group-hover:dark:text-white group-hover:text-zinc-700"
                      }`}
                    />
                  </div>
                  {!sidebarCollapsed && (
                    <span
                      className={
                        pathname === "/profile"
                          ? "dark:text-white text-white"
                          : "dark:text-white/80 text-zinc-600 group-hover:dark:text-white group-hover:text-zinc-800"
                      }
                    >
                      Profile
                    </span>
                  )}
                </Link>
              </li>
            </ul>

            {/* Removed administration section */}
          </nav>

          {/* Pin/Unpin Button for Desktop - Beautiful Design */}
          <div
            className={`hidden md:block mt-auto px-4 mb-3 ${sidebarCollapsed ? "px-2" : ""}`}
          >
            <Button
              variant="ghost"
              className={`w-full ${sidebarCollapsed ? "h-10 px-0" : "h-9 px-3"} rounded-lg dark:hover:bg-white/10 hover:bg-zinc-100 dark:border-white/10 border-zinc-200 border transition-all duration-300 group`}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? (
                <Pin className="h-4 w-4 dark:text-white/70 text-zinc-600 group-hover:dark:text-white group-hover:text-zinc-800" />
              ) : (
                <div className="flex items-center gap-2">
                  <PinOff className="h-4 w-4 dark:text-white/70 text-zinc-600 group-hover:dark:text-white group-hover:text-zinc-800" />
                  <span className="text-sm font-medium dark:text-white/80 text-zinc-600 group-hover:dark:text-white group-hover:text-zinc-800">
                    Collapse
                  </span>
                </div>
              )}
            </Button>
          </div>

          {/* Theme Toggle - Sleek Design */}
          <div className={`mt-2 px-4 mb-5 ${sidebarCollapsed ? "px-2" : ""}`}>
            {!sidebarCollapsed ? (
              <div className="rounded-full p-1 dark:bg-black/90 bg-zinc-200/90 backdrop-blur-sm flex items-center justify-between w-full max-w-[240px] mx-auto border-1">
                <button
                  className={`flex-1 py-1.5 px-2 rounded-full text-xs sm:text-sm flex items-center justify-center gap-1 transition-all ${
                    theme === "light"
                      ? "dark:bg-white bg-white dark:text-black text-black font-medium"
                      : "dark:text-white/70 text-zinc-600 dark:hover:text-white hover:text-zinc-800"
                  }`}
                  onClick={() => setTheme("light")}
                >
                  <Sun
                    className={`h-3.5 w-3.5 ${theme === "light" ? "" : "opacity-70"}`}
                  />
                  <span>Light</span>
                </button>
                <button
                  className={`flex-1 py-1.5 px-2 rounded-full text-xs sm:text-sm flex items-center justify-center gap-1 transition-all ${
                    theme === "dark"
                      ? "dark:bg-white bg-white dark:text-black text-black font-medium"
                      : "dark:text-white/70 text-zinc-600 dark:hover:text-white hover:text-zinc-800"
                  }`}
                  onClick={() => setTheme("dark")}
                >
                  <Moon
                    className={`h-3.5 w-3.5 ${theme === "dark" ? "" : "opacity-70"}`}
                  />
                  <span>Dark</span>
                </button>
                <button
                  className={`flex-1 py-1.5 px-2 rounded-full text-xs sm:text-sm flex items-center justify-center gap-1 transition-all ${
                    theme === "system"
                      ? "dark:bg-white bg-white dark:text-black text-black font-medium"
                      : "dark:text-white/70 text-zinc-600 dark:hover:text-white hover:text-zinc-800"
                  }`}
                  onClick={() => setTheme("system")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={theme === "system" ? "" : "opacity-70"}
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <span>Sys</span>
                </button>
              </div>
            ) : (
              // Collapsed theme toggle - icon only
              <div className="flex flex-col space-y-2">
                <button
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    theme === "light"
                      ? "dark:bg-white bg-white dark:text-black text-black"
                      : "dark:bg-white/10 bg-zinc-200 dark:text-white/70 text-zinc-600"
                  }`}
                  onClick={() => setTheme("light")}
                  title="Light theme"
                >
                  <Sun className="h-4 w-4" />
                </button>
                <button
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    theme === "dark"
                      ? "dark:bg-white bg-white dark:text-black text-black"
                      : "dark:bg-white/10 bg-zinc-200 dark:text-white/70 text-zinc-600"
                  }`}
                  onClick={() => setTheme("dark")}
                  title="Dark theme"
                >
                  <Moon className="h-4 w-4" />
                </button>
                <button
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    theme === "system"
                      ? "dark:bg-white bg-white dark:text-black text-black"
                      : "dark:bg-white/10 bg-zinc-200 dark:text-white/70 text-zinc-600"
                  }`}
                  onClick={() => setTheme("system")}
                  title="System theme"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* User profile section */}
          <div className={`mt-auto dark:border-white/10 border-zinc-200 ${sidebarCollapsed ? "px-2 py-3" : "px-3 py-4"}`}>
            {!sidebarCollapsed ? (
              <div className="flex items-center gap-3 p-2 rounded-lg dark:hover:bg-white/5 hover:bg-zinc-100 transition-colors backdrop-blur-sm">
                <div className="w-10 h-10 rounded-full dark:bg-gradient-to-br dark:from-white/20 dark:to-white/5 bg-gradient-to-br from-zinc-100 to-zinc-50 flex items-center justify-center dark:border-white/10 border-zinc-200 border shadow-inner overflow-hidden">
                  {getPhotoURL() ? (
                    <img src={getPhotoURL()!} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="dark:text-white text-zinc-700 font-medium">{getInitials()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15.5px] outfit font-semibold truncate dark:text-white text-zinc-900">{getDisplayName()}</p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#09fc69] flex-shrink-0"></div>
                    <p className="text-xs dark:text-white/60 text-zinc-500 truncate">{/* currentUserOrgRole?.designation || */ "Online"}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full dark:hover:bg-white/10 hover:bg-zinc-200">
                      <Settings className="h-4 w-4 dark:text-white/80 text-zinc-600" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 dark:bg-black/90 bg-white backdrop-blur-xl dark:border-white/10 border-zinc-200 border rounded-xl shadow-xl">
                    <DropdownMenuItem onClick={() => router.push("/profile")} className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>View Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} className="text-red-400 flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      <span>Sign Out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="flex justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-10 h-10 p-0 rounded-full dark:hover:bg-white/10 hover:bg-zinc-100 transition-colors"
                      title={`${getDisplayName()} - ${/* currentUserOrgRole?.designation || */ "Online"}`}
                    >
                      <div className="w-8 h-8 rounded-full dark:bg-gradient-to-br dark:from-white/20 dark:to-white/5 bg-gradient-to-br from-zinc-100 to-zinc-50 flex items-center justify-center dark:border-white/10 border-zinc-200 border shadow-inner overflow-hidden">
                        {getPhotoURL() ? (
                          <img src={getPhotoURL()!} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <span className="dark:text-white text-zinc-700 font-medium text-xs">{getInitials()}</span>
                        )}
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 dark:bg-black/90 bg-white backdrop-blur-xl dark:border-white/10 border-zinc-200 border rounded-xl shadow-xl">
                    <DropdownMenuLabel className="font-semibold">{getDisplayName()}</DropdownMenuLabel>
                    <DropdownMenuSeparator className="dark:bg-white/10 bg-zinc-200" />
                    <DropdownMenuItem onClick={() => router.push("/profile")} className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>View Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} className="text-red-400 flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      <span>Sign Out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main
          className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? "md:ml-16" : "md:ml-64"}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
