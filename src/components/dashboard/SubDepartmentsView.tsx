"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Department,
  DepartmentTreeNode,
  DepartmentPayload,
  DisplayUser,
} from "@/lib/types";
import {
  fetchChildDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  canUserManageDepartment,
  getEligibleMembersForDepartment,
  fetchDepartmentMembersUnified,
} from "@/lib/departmentUtils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  PlusCircle,
  ChevronRight,
  MoreHorizontal,
  Edit3,
  Trash2,
  Users,
  FolderOpen,
  Folder,
  Search,
  Crown,
  UserCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";

interface SubDepartmentsViewProps {
  parentDepartment: Department;
  orgId: string;
  canManageSettings: boolean;
}

interface CreateDepartmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: DepartmentPayload) => Promise<void>;
  parentDepartment?: Department; // Make optional to handle edge cases
}

function CreateDepartmentDialog({
  isOpen,
  onClose,
  onSubmit,
  parentDepartment,
}: CreateDepartmentDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedControllers, setSelectedControllers] = useState<string[]>([]);
  const [eligibleMembers, setEligibleMembers] = useState<DisplayUser[]>([]);
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Load eligible members when dialog opens
  useEffect(() => {
    if (isOpen && parentDepartment) {
      loadEligibleMembers();
    }
  }, [isOpen, parentDepartment]);

  const loadEligibleMembers = async () => {
    if (!parentDepartment) return;

    setIsLoadingMembers(true);
    setEligibleMembers([]); // Clear previous members
    try {
      const members = await getEligibleMembersForDepartment(
        parentDepartment.orgId,
        parentDepartment.id
      );
      setEligibleMembers(members);
    } catch (error: any) {
      console.error("Error loading eligible members:", error);
      // Show the specific error message from the utility function
      const errorMessage = error.message || "Failed to load available members";
      toast.error(errorMessage);
      setEligibleMembers([]); // Ensure empty state
    } finally {
      setIsLoadingMembers(false);
    }
  };

  // Filter members based on search
  const filteredMembers = eligibleMembers.filter(
    (member) =>
      member.name?.toLowerCase().includes(memberSearchTerm.toLowerCase()) ||
      member.email?.toLowerCase().includes(memberSearchTerm.toLowerCase())
  );

  const handleMemberToggle = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleControllerToggle = (memberId: string) => {
    setSelectedControllers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Department name is required");
      return;
    }

    if (selectedMembers.length === 0) {
      toast.error("Please select at least one member for this department");
      return;
    }

    // Controllers must be members
    const invalidControllers = selectedControllers.filter(
      (id) => !selectedMembers.includes(id)
    );
    if (invalidControllers.length > 0) {
      toast.error("Department controllers must be selected as members");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        parentDepartmentId: parentDepartment?.id || null,
        memberIds: selectedMembers,
        controllerUserIds: selectedControllers,
      });

      // Reset form
      setName("");
      setDescription("");
      setSelectedMembers([]);
      setSelectedControllers([]);
      setMemberSearchTerm("");
      onClose();
      toast.success("Sub-department created successfully");
    } catch (error) {
      console.error("Error creating department:", error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to create sub-department");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setSelectedMembers([]);
    setSelectedControllers([]);
    setMemberSearchTerm("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Sub-Department</DialogTitle>
          <DialogDescription>
            Add a department under <strong>{parentDepartment?.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Basic Info */}
          <div className="space-y-2">
            <Label htmlFor="dept-name">Department Name</Label>
            <Input
              id="dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Frontend Team"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dept-description">Description (Optional)</Label>
            <Textarea
              id="dept-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this department do?"
              rows={3}
            />
          </div>

          {/* Member Selection */}
          <div className="space-y-3">
            <Label>Select Members</Label>
            <p className="text-sm text-muted-foreground">
              Choose from {eligibleMembers.length} available members
            </p>

            {/* Search */}
            <Input
              value={memberSearchTerm}
              onChange={(e) => setMemberSearchTerm(e.target.value)}
              placeholder="Search members..."
              className="mb-3"
            />

            {/* Members List */}
            <div className="max-h-64 overflow-y-auto border rounded p-2">
              {isLoadingMembers ? (
                <p className="text-center py-4 text-muted-foreground">
                  Loading...
                </p>
              ) : filteredMembers.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-muted-foreground mb-2">
                    {memberSearchTerm
                      ? "No matches found"
                      : "No members available"}
                  </p>
                  {!memberSearchTerm && eligibleMembers.length === 0 && (
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>
                        The parent department "{parentDepartment?.name}" has no
                        members assigned.
                      </p>
                      <p className="text-xs">To create sub-departments:</p>
                      <ol className="text-xs list-decimal list-inside space-y-1 ml-2">
                        <li>Go to Organization → Departments</li>
                        <li>
                          Assign users to the "{parentDepartment?.name}"
                          department
                        </li>
                        <li>Return here to create sub-departments</li>
                      </ol>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMembers.map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center space-x-3 p-2 hover:bg-muted rounded cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedMembers.includes(member.id)}
                        onCheckedChange={() => handleMemberToggle(member.id)}
                      />
                      <Avatar className="w-8 h-8 rounded-full">
                        <AvatarImage
                          src={member.avatarUrl || undefined}
                          alt={member.name || "Member"}
                        />
                        <AvatarFallback className="text-sm rounded-full bg-zinc-600 text-white">
                          {member.name
                            ? member.name
                                .split(" ")
                                .map((n) => n.charAt(0))
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()
                            : "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <span className="font-medium">{member.name}</span>
                        {member.email && (
                          <p className="text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        )}
                      </div>
                      {selectedMembers.includes(member.id) && (
                        <Checkbox
                          checked={selectedControllers.includes(member.id)}
                          onCheckedChange={() =>
                            handleControllerToggle(member.id)
                          }
                          title="Make controller"
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedMembers.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedMembers.length} member
                {selectedMembers.length !== 1 ? "s" : ""} selected
                {selectedControllers.length > 0 &&
                  `, ${selectedControllers.length} controller${selectedControllers.length !== 1 ? "s" : ""}`}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isSubmitting || !name.trim() || selectedMembers.length === 0
            }
          >
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SubDepartmentsView({
  parentDepartment,
  orgId,
  canManageSettings,
}: SubDepartmentsViewProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [subDepartments, setSubDepartments] = useState<Department[]>([]);
  const [departmentMembers, setDepartmentMembers] = useState<
    Record<string, any[]>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Animation state for navigation
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

  // Load sub-departments
  useEffect(() => {
    loadSubDepartments();
  }, [parentDepartment.id]);

  const loadSubDepartments = async () => {
    setIsLoading(true);
    try {
      const children = await fetchChildDepartments(parentDepartment.id, orgId);
      setSubDepartments(children);

      // Fetch members for each sub-department
      const membersMap: Record<string, any[]> = {};
      for (const dept of children) {
        try {
          const members = await fetchDepartmentMembersUnified(dept.id, orgId);
          membersMap[dept.id] = members;
        } catch (error) {
          console.error(
            `Error fetching members for department ${dept.id}:`,
            error
          );
          membersMap[dept.id] = [];
        }
      }
      setDepartmentMembers(membersMap);
    } catch (error) {
      console.error("Error loading sub-departments:", error);
      toast.error("Failed to load sub-departments");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDepartment = async (payload: DepartmentPayload) => {
    try {
      await createDepartment(orgId, payload);
      await loadSubDepartments();
    } catch (error) {
      console.error("Error creating department:", error);
      if (error instanceof Error) {
        if (error.message.includes("Parent department")) {
          throw new Error(error.message);
        } else if (error.message.includes("Database index")) {
          throw new Error(error.message);
        }
      }
      throw new Error("Failed to create sub-department. Please try again.");
    }
  };

  const handleDepartmentClick = (deptId: string) => {
    setSelectedDeptId(deptId);
    setIsTransitioning(true);

    // Navigate with animation
    setTimeout(() => {
      router.push(`/dashboard/teams/${deptId}`);
    }, 150);
  };

  // Edit department state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentEditingDepartment, setCurrentEditingDepartment] =
    useState<Department | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    description: "",
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const handleEdit = (dept: Department) => {
    setCurrentEditingDepartment(dept);
    setEditFormData({
      name: dept.name,
      description: dept.description || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateDepartment = async () => {
    if (!currentEditingDepartment || !editFormData.name.trim()) {
      toast.error("Department name is required");
      return;
    }

    setIsUpdating(true);
    try {
      await updateDepartment(currentEditingDepartment.id, {
        name: editFormData.name.trim(),
        description: editFormData.description.trim(),
      });

      // Update local state
      setSubDepartments((prevDepts) =>
        prevDepts.map((dept) =>
          dept.id === currentEditingDepartment.id
            ? {
                ...dept,
                name: editFormData.name.trim(),
                description: editFormData.description.trim(),
              }
            : dept
        )
      );

      setIsEditDialogOpen(false);
      setCurrentEditingDepartment(null);
      setEditFormData({ name: "", description: "" });
      toast.success("Department updated successfully!");
    } catch (error) {
      console.error("Error updating department:", error);
      toast.error("Failed to update department");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = (dept: Department) => {
    handleDeleteDepartment(dept.id, dept.name);
  };

  const handleDeleteDepartment = async (deptId: string, deptName: string) => {
    const confirmed = confirm(
      `Are you sure you want to delete "${deptName}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await deleteDepartment(deptId, true); // Move children to parent
      await loadSubDepartments();
      toast.success("Department deleted successfully");
    } catch (error) {
      console.error("Error deleting department:", error);
      toast.error("Failed to delete department");
    }
  };

  const canUserManageThisDept = (dept: Department): boolean => {
    if (!user) return false;
    return canManageSettings || canUserManageDepartment(dept, user.uid);
  };

  if (isLoading) {
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
              Loading sub-departments...
            </p>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (subDepartments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16">
        <div className="rounded-full bg-primary/10 p-8 mb-6">
          <Building2 className="h-16 w-16 text-primary" />
        </div>
        <h3 className="spacegrot text-3xl font-bold mb-3">No Sub-Departments Yet</h3>
        <p className="proximavara text-muted-foreground max-w-md mb-8 leading-relaxed">
          This department doesn't have any sub-departments yet. Create one to
          organize your teams better and establish a clear hierarchy.
        </p>
        {canManageSettings && (
          <Button
            onClick={() => setShowCreateDialog(true)}
            size="lg"
            className="proximavara gap-3 px-8 py-3 rounded-md shadow-lg hover:shadow-xl transition-all duration-300"
          >
            <PlusCircle className="h-5 w-5" />
            Create Your First Sub-Department
          </Button>
        )}

        <CreateDepartmentDialog
          isOpen={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onSubmit={handleCreateDepartment}
          parentDepartment={parentDepartment}
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key="sub-departments-page"
          initial={{ opacity: 1, scale: 1, rotateX: 0 }}
          animate={{
            opacity: isTransitioning ? 0 : 1,
            scale: isTransitioning ? 1.2 : 1,
            rotateX: isTransitioning ? -15 : 0,
            filter: isTransitioning ? "blur(8px)" : "blur(0px)",
          }}
          exit={{
            opacity: 0,
            scale: 2,
            rotateX: -25,
            filter: "blur(20px)",
          }}
          transition={{
            duration: isTransitioning ? 0.7 : 0.7,
            ease: isTransitioning
              ? [0.23, 1, 0.32, 1]
              : [0.25, 0.46, 0.45, 0.94],
            filter: { duration: 0.7 },
          }}
          style={{
            transformStyle: "preserve-3d",
            perspective: 1000,
            transformOrigin: "center center",
          }}
          className="relative overflow-hidden"
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
                      duration: 1.5,
                      delay: i * 0.05,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="absolute w-1 h-1 bg-blue-400 rounded-full"
                  />
                ))}

                {/* Central loading indicator */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    initial={{ scale: 0, rotate: 0 }}
                    animate={{ scale: 1, rotate: 360 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
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

          <div className=" overflow-hidden min-h-[calc(100vh-4rem)]">
            {/* Header with create button */}
            <header className="mb-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h1 className="text-2xl font-medium flex items-center montserrat">
                    Departments in {parentDepartment.name}
                  </h1>
                  <p className="text-md text-muted-foreground mt-1 spacemono">
                    Sub Departments in {parentDepartment.name}.
                  </p>
                </div>
                {canManageSettings && (
                  <Button
                    onClick={() => setShowCreateDialog(true)}
                    className="gap-2 px-6 py-2 rounded-md shadow-lg hover:shadow-xl transition-all duration-300"
                  >
                    <PlusCircle className="h-5 w-5" />
                    Add Sub-Department
                  </Button>
                )}
              </div>
            </header>

            {!isLoading && subDepartments.length === 0 && (
              <div className="text-center border-2 border-dashed border-muted rounded-lg py-20">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold text-muted-foreground">
                  No Sub-Departments Found
                </h3>
                <p className="text-muted-foreground">
                  No sub-departments have been created under{" "}
                  {parentDepartment.name} yet.
                </p>
                {canManageSettings && (
                  <Button
                    onClick={() => setShowCreateDialog(true)}
                    className="mt-4 gap-2"
                    variant="outline"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Create First Sub-Department
                  </Button>
                )}
              </div>
            )}

            {!isLoading && subDepartments.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 3xl:grid-cols-6 gap-6 overflow-hidden"
              >
                {subDepartments.map((dept, index) => (
                  <motion.div
                    key={dept.id}
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
                      ease: [0.6, 0.45, 0.46, 0.94],
                      opacity: { duration: 0.3, delay: index * 0.04 },
                      scale: {
                        duration: 0.6,
                        delay: index * 0.04,
                        ease: [0.68, -0.55, 0.265, 1.55],
                      },
                    }}
                    style={{
                      transformStyle: "preserve-3d",
                      perspective: 1200,
                    }}
                  >
                    <Card
                      className={`overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group bg-card dark:bg-zinc-950 py-4 border border-border/50 hover:border-primary/20 ${
                        selectedDeptId === dept.id
                          ? "ring-4 ring-blue-500/50 border-blue-500/70 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-cyan-500/10 shadow-2xl shadow-blue-500/25"
                          : ""
                      }`}
                      onClick={() => handleDepartmentClick(dept.id)}
                    >
                      <CardHeader className="">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg truncate group-hover:text-primary font-medium montserrat transition-colors duration-200">
                              {dept.name}
                            </CardTitle>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                variant="secondary"
                                className="text-xs px-2 py-1 spacemono"
                              >
                                Level {dept.level}
                              </Badge>
                              {departmentMembers[dept.id] &&
                                departmentMembers[dept.id].length > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs px-2 py-1"
                                  >
                                    {departmentMembers[dept.id].length} member
                                    {departmentMembers[dept.id].length !== 1
                                      ? "s"
                                      : ""}
                                  </Badge>
                                )}
                            </div>
                          </div>

                          {canUserManageThisDept(dept) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(dept);
                                  }}
                                >
                                  <Edit3 className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(dept);
                                  }}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="flex items-center justify-center bg-card dark:bg-zinc-950 overflow-hidden mb-3">
                        {departmentMembers[dept.id] &&
                        departmentMembers[dept.id].length > 0 ? (
                          <div className="grid grid-cols-2 grid-rows-2 gap-2 w-full h-full">
                            {/* Top-left cell */}
                            <div className="flex flex-col items-center justify-center">
                              {departmentMembers[dept.id][0] && (
                                <>
                                  <Avatar className="w-16 h-16 rounded-full mb-1">
                                    <AvatarImage
                                      src={
                                        departmentMembers[dept.id][0]
                                          .photoURL || undefined
                                      }
                                      alt={
                                        departmentMembers[dept.id][0]
                                          .displayName || "Member"
                                      }
                                    />
                                    <AvatarFallback className="text-2xl sm:text-3xl rounded-full bg-zinc-900 text-white">
                                      {departmentMembers[dept.id][0]
                                        .firstName &&
                                      departmentMembers[dept.id][0].lastName
                                        ? `${departmentMembers[
                                            dept.id
                                          ][0].firstName.charAt(
                                            0
                                          )}${departmentMembers[
                                            dept.id
                                          ][0].lastName.charAt(
                                            0
                                          )}`.toUpperCase()
                                        : departmentMembers[dept.id][0]
                                              .displayName
                                          ? (() => {
                                              const nameParts =
                                                departmentMembers[
                                                  dept.id
                                                ][0].displayName
                                                  .trim()
                                                  .split(" ")
                                                  .filter(
                                                    (part: string) =>
                                                      part.length > 0
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
                                    {departmentMembers[
                                      dept.id
                                    ][0].displayName?.split(" ")[0] || ""}
                                  </p>
                                </>
                              )}
                            </div>

                            {/* Top-right cell */}
                            <div className="flex flex-col items-center justify-center">
                              {departmentMembers[dept.id][1] && (
                                <>
                                  <Avatar className="w-16 h-16 rounded-full mb-1">
                                    <AvatarImage
                                      src={
                                        departmentMembers[dept.id][1]
                                          .photoURL || undefined
                                      }
                                      alt={
                                        departmentMembers[dept.id][1]
                                          .displayName || "Member"
                                      }
                                    />
                                    <AvatarFallback className="text-2xl sm:text-3xl rounded-full bg-zinc-900 text-white">
                                      {departmentMembers[dept.id][1]
                                        .firstName &&
                                      departmentMembers[dept.id][1].lastName
                                        ? `${departmentMembers[
                                            dept.id
                                          ][1].firstName.charAt(
                                            0
                                          )}${departmentMembers[
                                            dept.id
                                          ][1].lastName.charAt(
                                            0
                                          )}`.toUpperCase()
                                        : departmentMembers[dept.id][1]
                                              .displayName
                                          ? (() => {
                                              const nameParts =
                                                departmentMembers[
                                                  dept.id
                                                ][1].displayName
                                                  .trim()
                                                  .split(" ")
                                                  .filter(
                                                    (part: string) =>
                                                      part.length > 0
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
                                    {departmentMembers[
                                      dept.id
                                    ][1].displayName?.split(" ")[0] || ""}
                                  </p>
                                </>
                              )}
                            </div>

                            {/* Bottom-left cell */}
                            <div className="flex flex-col items-center justify-center">
                              {departmentMembers[dept.id][2] && (
                                <>
                                  <Avatar className="w-16 h-16 rounded-full mb-1">
                                    <AvatarImage
                                      src={
                                        departmentMembers[dept.id][2]
                                          .photoURL || undefined
                                      }
                                      alt={
                                        departmentMembers[dept.id][2]
                                          .displayName || "Member"
                                      }
                                    />
                                    <AvatarFallback className="text-2xl sm:text-3xl rounded-full bg-zinc-900 text-white">
                                      {departmentMembers[dept.id][2]
                                        .firstName &&
                                      departmentMembers[dept.id][2].lastName
                                        ? `${departmentMembers[
                                            dept.id
                                          ][2].firstName.charAt(
                                            0
                                          )}${departmentMembers[
                                            dept.id
                                          ][2].lastName.charAt(
                                            0
                                          )}`.toUpperCase()
                                        : departmentMembers[dept.id][2]
                                              .displayName
                                          ? (() => {
                                              const nameParts =
                                                departmentMembers[
                                                  dept.id
                                                ][2].displayName
                                                  .trim()
                                                  .split(" ")
                                                  .filter(
                                                    (part: string) =>
                                                      part.length > 0
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
                                    {departmentMembers[
                                      dept.id
                                    ][2].displayName?.split(" ")[0] || ""}
                                  </p>
                                </>
                              )}
                            </div>

                            {/* Bottom-right cell (can be a nested grid or 4th large avatar) */}
                            <div className="flex flex-col items-center justify-center">
                              {departmentMembers[dept.id].length > 3 ? (
                                <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                                  {departmentMembers[dept.id]
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
                                                          (part: string) =>
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
                                      4 -
                                        (departmentMembers[dept.id].length - 3)
                                    ),
                                  }).map((_, i) => (
                                    <div
                                      key={`empty-sm-${i}`}
                                      className="w-full h-full bg-transparent rounded-md aspect-square"
                                    ></div>
                                  ))}
                                </div>
                              ) : (
                                departmentMembers[dept.id][3] && (
                                  <>
                                    <Avatar className="w-16 h-16 rounded-full mb-1">
                                      <AvatarImage
                                        src={
                                          departmentMembers[dept.id][3]
                                            .photoURL || undefined
                                        }
                                        alt={
                                          departmentMembers[dept.id][3]
                                            .displayName || "Member"
                                        }
                                      />
                                      <AvatarFallback className="text-2xl sm:text-3xl rounded-full bg-zinc-900 text-white">
                                        {departmentMembers[dept.id][3]
                                          .firstName &&
                                        departmentMembers[dept.id][3].lastName
                                          ? `${departmentMembers[
                                              dept.id
                                            ][3].firstName.charAt(
                                              0
                                            )}${departmentMembers[
                                              dept.id
                                            ][3].lastName.charAt(
                                              0
                                            )}`.toUpperCase()
                                          : departmentMembers[dept.id][3]
                                                .displayName
                                            ? (() => {
                                                const nameParts =
                                                  departmentMembers[
                                                    dept.id
                                                  ][3].displayName
                                                    .trim()
                                                    .split(" ")
                                                    .filter(
                                                      (part: string) =>
                                                        part.length > 0
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
                                      {departmentMembers[
                                        dept.id
                                      ][3].displayName?.split(" ")[0] || ""}
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
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Create dialog */}
      <CreateDepartmentDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSubmit={handleCreateDepartment}
        parentDepartment={parentDepartment}
      />

      {/* Edit Department Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
            <DialogDescription>
              Update the details for "{currentEditingDepartment?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-dept-name" className="text-right">
                Name
              </Label>
              <Input
                id="edit-dept-name"
                value={editFormData.name}
                onChange={(e) =>
                  setEditFormData((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                className="col-span-3"
                placeholder="Department name"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label
                htmlFor="edit-dept-description"
                className="text-right pt-2"
              >
                Description
              </Label>
              <Textarea
                id="edit-dept-description"
                value={editFormData.description}
                onChange={(e) =>
                  setEditFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="col-span-3 min-h-[80px]"
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateDepartment}
              disabled={isUpdating || !editFormData.name.trim()}
            >
              {isUpdating ? "Updating..." : "Update Department"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}





