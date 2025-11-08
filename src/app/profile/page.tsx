"use client";

import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Edit3, Mail, Calendar, Building2, User } from "lucide-react";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  OrgRole,
  UserOrgRole,
  Department,
  DepartmentalRole,
} from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DashboardLayout from "@/components/Layout/DashboardLayout";

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

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentUserOrgRole, setCurrentUserOrgRole] =
    useState<UserOrgRole | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editData, setEditData] = useState({
    displayName: "",
    firstName: "",
    lastName: "",
    phone: "",
    departments: [] as string[], // Changed to array for multiple departments
    position: "",
  });

  useEffect(() => {
    if (!user && !loading) {
      router.push("/login");
      return;
    }

    if (user) {
      const fetchUserProfile = async () => {
        try {
          // Fetch user profile
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const profileData = userDoc.data() as UserProfile;
            setProfile(profileData);

            // Handle both Google users (displayName) and non-Google users (firstName + lastName)
            const fullName =
              profileData.displayName ||
              (profileData.firstName && profileData.lastName
                ? `${profileData.firstName} ${profileData.lastName}`
                : user.displayName || "");

            // Get current user org role
            const orgRole = user.orgRoles?.find(
              (role) => role.orgId === user.organizationId
            );
            setCurrentUserOrgRole(orgRole || null);

            setEditData({
              displayName: fullName,
              firstName: profileData.firstName || "",
              lastName: profileData.lastName || "",
              phone: profileData.phone || "",
              departments: orgRole?.departmentalRoles || [], // Use departmental roles from org role
              position: orgRole?.designation || "",
            });
          }

          // Fetch departments if user has organization
          if (user.organizationId) {
            const orgDoc = await getDoc(
              doc(db, "organizations", user.organizationId)
            );
            if (orgDoc.exists()) {
              const orgData = orgDoc.data();
              setDepartments(orgData.customDepartments || []);
            }
          }
        } catch (error) {
          console.error("Error fetching profile:", error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchUserProfile();
    }
  }, [user, loading, router]);

  // Helper function to get the user's photo URL
  const getPhotoURL = () => {
    // Priority: profile photoURL → user photoURL → null
    return profile?.photoURL || user?.photoURL || null;
  };

  // Helper function to get the correct display name
  const getDisplayName = () => {
    if (editData.displayName) return editData.displayName;
    if (profile?.displayName) return profile.displayName;
    if (profile?.firstName && profile?.lastName) {
      return `${profile.firstName} ${profile.lastName}`;
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

  const handleSave = async () => {
    if (!user) return;

    try {
      // Determine if this is a Google user or non-Google user
      const isGoogleUser = user.providerData?.some(
        (provider) => provider.providerId === "google.com"
      );

      const updateData: any = {
        phone: editData.phone,
      };

      // Check if user has permission to edit department and position
      const canEditDepartmentAndPosition =
        currentUserOrgRole?.orgRole === OrgRole.OWNER ||
        currentUserOrgRole?.orgRole === OrgRole.ADMIN;

      // Don't update department in user document anymore - it's handled via orgRoles

      if (isGoogleUser) {
        // For Google users, update displayName and photoURL
        updateData.displayName = editData.displayName;
        if (user.photoURL) {
          updateData.photoURL = user.photoURL;
        }
      } else {
        // For non-Google users, split the full name into firstName and lastName
        const nameParts = editData.displayName.trim().split(" ");
        updateData.firstName = nameParts[0] || "";
        updateData.lastName = nameParts.slice(1).join(" ") || "";
      }

      // Update user document
      await updateDoc(doc(db, "users", user.uid), updateData);

      // Update organization role if position or departments were changed and user has permission
      if (
        canEditDepartmentAndPosition &&
        (editData.position !== currentUserOrgRole?.designation ||
          JSON.stringify(editData.departments) !==
            JSON.stringify(currentUserOrgRole?.departmentalRoles))
      ) {
        const updatedOrgRoles =
          user.orgRoles?.map((role) => {
            if (role.orgId === user.organizationId) {
              return {
                ...role,
                designation: editData.position,
                departmentalRoles: editData.departments as DepartmentalRole[],
              };
            }
            return role;
          }) || [];

        await updateDoc(doc(db, "users", user.uid), {
          orgRoles: updatedOrgRoles,
        });

        // Update local state
        setCurrentUserOrgRole((prev) =>
          prev
            ? {
                ...prev,
                designation: editData.position,
                departmentalRoles: editData.departments as DepartmentalRole[],
              }
            : null
        );
      }

      setProfile((prev) => (prev ? { ...prev, ...updateData } : null));
      setIsEditing(false);
      toast.success("Profile updated successfully");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    }
  };

  if (loading || isLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen dark:bg-black bg-zinc-50 p-6 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="montserrat text-3xl font-medium tracking-tight dark:text-white text-zinc-900">
            Profile Settings
          </h1>
          <p className="spacemono text-zinc-500 dark:text-zinc-400 mt-2">
            Manage your personal information and preferences
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          {/* Profile Header Card */}
          <Card className="dark:bg-zinc-900 bg-white border-none">
            <CardContent className="p-8">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                {/* Profile Avatar */}
                <div className="relative">
                  <div className="montserrat w-24 h-24 rounded-full dark:bg-gradient-to-br dark:from-white/20 dark:to-white/5 bg-gradient-to-br from-zinc-100 to-zinc-50 flex items-center justify-center dark:border-white/10 border-zinc-200 border shadow-inner overflow-hidden">
                    {getPhotoURL() ? (
                      <img
                        src={getPhotoURL()!}
                        alt={getDisplayName()}
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <span className="dark:text-white text-zinc-700 text-2xl font-semibold">
                        {getInitials()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Profile Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="montserrat text-2xl font-semibold dark:text-white text-zinc-900">
                      {getDisplayName()}
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(!isEditing)}
                      className="outfit dark:bg-zinc-800 bg-zinc-100"
                    >
                      <Edit3 className="h-4 w-4 mr-2" />
                      {isEditing ? "Cancel" : "Edit"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-zinc-500 dark:text-zinc-400">
                    <div className="spacemono flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span>{profile?.email || user?.email}</span>
                    </div>
                    {currentUserOrgRole?.designation && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>{currentUserOrgRole.designation}</span>
                      </div>
                    )}
                    {currentUserOrgRole?.departmentalRoles &&
                      currentUserOrgRole.departmentalRoles.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span>
                            {currentUserOrgRole.departmentalRoles.join(", ")}
                          </span>
                        </div>
                      )}
                    {profile?.createdAt && (
                      <div className="outfit flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>
                          Joined{" "}
                          {profile.createdAt.toDate().toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edit Form */}
          {isEditing && (
            <Card className="dark:bg-zinc-900 bg-white border-none shadow-lg">
              <CardHeader>
                <CardTitle className="montserrat dark:text-white text-zinc-900">
                  Edit Profile Information
                </CardTitle>
                <CardDescription className="spacemono">
                  Update your personal details and contact information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="outfit space-y-2">
                    <Label
                      htmlFor="displayName"
                      className="outfit dark:text-white text-zinc-900"
                    >
                      Full Name
                    </Label>
                    <Input
                      id="displayName"
                      value={editData.displayName}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          displayName: e.target.value,
                        }))
                      }
                      className="dark:bg-zinc-800 bg-zinc-50 border-none"
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="phone"
                      className="outfit dark:text-white text-zinc-900"
                    >
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      value={editData.phone}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                      className="outfit dark:bg-zinc-800 bg-zinc-50 border-none"
                      placeholder="Enter your phone number"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="position"
                      className="outfit dark:text-white text-zinc-900"
                    >
                      Job Title
                      {currentUserOrgRole?.orgRole !== OrgRole.OWNER &&
                        currentUserOrgRole?.orgRole !== OrgRole.ADMIN && (
                          <span className="text-xs text-zinc-500 ml-2">
                            (Admin only)
                          </span>
                        )}
                    </Label>
                    <Input
                      id="position"
                      value={editData.position}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          position: e.target.value,
                        }))
                      }
                      className="dark:bg-zinc-800 bg-zinc-50 border-none"
                      placeholder="Enter your job title"
                      disabled={
                        currentUserOrgRole?.orgRole !== OrgRole.OWNER &&
                        currentUserOrgRole?.orgRole !== OrgRole.ADMIN
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="departments"
                      className="outfit dark:text-white text-zinc-900"
                    >
                      Departments
                      {currentUserOrgRole?.orgRole !== OrgRole.OWNER &&
                        currentUserOrgRole?.orgRole !== OrgRole.ADMIN && (
                          <span className="text-xs text-zinc-500 ml-2">
                            (Admin only)
                          </span>
                        )}
                    </Label>
                    {currentUserOrgRole?.orgRole === OrgRole.OWNER ||
                    currentUserOrgRole?.orgRole === OrgRole.ADMIN ? (
                      <div className="dark:bg-zinc-800 bg-zinc-50 border rounded-md p-3 space-y-2 max-h-32 overflow-y-auto">
                        {departments.length > 0 ? (
                          departments.map((dept) => (
                            <div
                              key={dept.id}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={`dept-${dept.id}`}
                                checked={editData.departments.includes(
                                  dept.name
                                )}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setEditData((prev) => ({
                                      ...prev,
                                      departments: [
                                        ...prev.departments,
                                        dept.name,
                                      ],
                                    }));
                                  } else {
                                    setEditData((prev) => ({
                                      ...prev,
                                      departments: prev.departments.filter(
                                        (d) => d !== dept.name
                                      ),
                                    }));
                                  }
                                }}
                              />
                              <Label
                                htmlFor={`dept-${dept.id}`}
                                className="text-sm font-normal cursor-pointer"
                              >
                                {dept.name}
                              </Label>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-zinc-500">
                            No departments available
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="dark:bg-zinc-800 bg-zinc-50 border rounded-md p-3">
                        <p className="text-sm text-zinc-500">
                          {currentUserOrgRole?.departmentalRoles &&
                          currentUserOrgRole.departmentalRoles.length > 0
                            ? currentUserOrgRole.departmentalRoles.join(", ")
                            : "No departments assigned"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    className="outfit dark:bg-zinc-800 bg-zinc-100"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    className="outfit dark:bg-[#EDEDED] dark:text-black hover:bg-zinc-700 text-white"
                  >
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Account Information */}
          <Card className="dark:bg-zinc-900 bg-white border-none shadow-lg">
            <CardHeader>
              <CardTitle className="montserrat dark:text-white text-zinc-900">
                Account Information
              </CardTitle>
              <CardDescription className="spacemono">
                Your account details and security information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="outfit text-sm font-medium dark:text-zinc-300 text-zinc-600">
                    Email Address
                  </Label>
                  <p className="spacemono mt-1 dark:text-white text-zinc-900">
                    {profile?.email || user?.email}
                  </p>
                </div>

                <div>
                  <Label className="outfit text-sm font-medium dark:text-zinc-300 text-zinc-600">
                    Account Status
                  </Label>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#09fc69]"></div>
                    <span className="spacemono dark:text-white text-zinc-900">
                      Active
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
